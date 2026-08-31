import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { accessRequestRoles, loadAccessRequests, processAccessRequest } from "../services/accessRequests";
import type { AccessRequest, AccessRequestStatus, RoleName } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";

const timestamp = (value:string) => new Intl.DateTimeFormat("en-PH", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value));

export function AccessRequestsView({churchId}:{churchId:string}) {
  const [requests,setRequests]=useState<AccessRequest[]>([]);
  const [status,setStatus]=useState<AccessRequestStatus>("Pending");
  const [approval,setApproval]=useState<AccessRequest|null>(null);
  const [finalRole,setFinalRole]=useState<RoleName|"">("");
  const [processingId,setProcessingId]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [decisionError,setDecisionError]=useState("");
  const [notice,setNotice]=useState("");

  const refresh=useCallback(async()=>{setLoading(true);setError("");try{setRequests(await loadAccessRequests(churchId));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load access requests.");}finally{setLoading(false);}},[churchId]);
  useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]);
  const visible=useMemo(()=>requests.filter(request=>request.status===status),[requests,status]);

  const approve=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); if(!approval||!finalRole){setError("Select the final approved role.");return;}
    setProcessingId(approval.id);setDecisionError("");setError("");setNotice("");
    try{const message=await processAccessRequest(churchId,approval.id,"approve",finalRole);setNotice(message);setApproval(null);setFinalRole("");await refresh();}
    catch(cause){setDecisionError(cause instanceof Error?cause.message:"Unable to approve this request.");}
    finally{setProcessingId("");}
  };
  const reject=async(request:AccessRequest)=>{
    if(!window.confirm(`Reject the access request from ${request.fullName}?`))return;
    setProcessingId(request.id);setError("");setNotice("");
    try{const message=await processAccessRequest(churchId,request.id,"reject");setNotice(message);await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to reject this request.");}
    finally{setProcessingId("");}
  };

  return <section className="panel table-panel access-request-panel">
    <div className="panel-head"><div><p className="eyebrow">Admin approval queue</p><h2>Access requests</h2></div><div className="request-tabs" aria-label="Request status">{(["Pending","Approved","Rejected"] as const).map(item=><button key={item} className={status===item?"active":""} onClick={()=>setStatus(item)}>{item} <span>{requests.filter(request=>request.status===item).length}</span></button>)}</div></div>
    <p className="audit-note">Requested roles are suggestions only. Approval always requires an Admin to select the final role. Invitation links expire according to the Supabase Email OTP setting.</p>
    {notice&&<div className="form-success access-message" role="status">{notice}</div>}
    {error&&<div className="error-banner access-message" role="alert"><span>{error}</span><button onClick={()=>void refresh()}>Try again</button></div>}
    {loading?<div className="users-loading"><LoadingSkeleton rows={4} label="Loading the secured access request queue"/></div>:<div className="table-wrap access-table responsive-table"><table><thead><tr><th>Submitted</th><th>Applicant</th><th>Requested role</th><th>Reason</th><th>Status / Final role</th><th>Action</th></tr></thead><tbody>{visible.map(request=><tr key={request.id}><td data-label="Submitted">{timestamp(request.createdAt)}</td><td data-label="Applicant"><b>{request.fullName}</b><small>{request.email}{request.phone?` · ${request.phone}`:""}</small></td><td data-label="Requested role"><span className="suggested-role">{request.requestedRole}</span><small>Suggestion only</small></td><td data-label="Reason" className="request-reason">{request.reason}</td><td data-label="Status"><span className={`status request-${request.status.toLowerCase()}`}>{request.status}</span>{request.approvedRole&&<small>Final role: {request.approvedRole}</small>}{request.approvedAt&&<small>{request.approvedByName||"Admin"} · {timestamp(request.approvedAt)}</small>}</td><td data-label="Action">{request.status==="Pending"?<div className="row-actions"><button className="table-action" disabled={!!processingId} onClick={()=>{setApproval(request);setFinalRole("");}}>Approve</button><button className="table-action danger" disabled={!!processingId} onClick={()=>void reject(request)}>{processingId===request.id?"Working…":"Reject"}</button></div>:<span className="processed-label">Processed</span>}</td></tr>)}{!visible.length&&<tr><td colSpan={6} className="blank-row"><EmptyState compact title={`No ${status.toLowerCase()} requests`} description={status==="Pending"?"New access requests will appear here for your review.":`Processed ${status.toLowerCase()} requests will remain available here.`}/></td></tr>}</tbody></table></div>}
    {approval&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!processingId)setApproval(null);}}><section className="modal access-approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title"><div className="modal-head"><div><p className="eyebrow">Final authorization</p><h2 id="approval-title">Approve {approval.fullName}</h2></div><button className="close-button" disabled={!!processingId} onClick={()=>setApproval(null)} aria-label="Close">×</button></div><div className="request-approval-summary"><span>Requested role</span><b>{approval.requestedRole}</b><p>This is the applicant’s suggestion and is not automatically assigned.</p></div>{decisionError&&<div className="form-error" role="alert">{decisionError}</div>}<form className="record-form" onSubmit={approve}><div className="form-grid"><label className="full">Final approved role<select value={finalRole} onChange={event=>setFinalRole(event.target.value as RoleName|"")} required><option value="">Select final role…</option>{accessRequestRoles.map(role=><option key={role} value={role}>{role}</option>)}</select></label></div><p className="audit-note">Approving sends a time-limited Supabase invitation and records the selected role, approver, and before/after values in the immutable audit log.</p><button className="primary-button form-submit" disabled={!!processingId||!finalRole}>{processingId?"Sending invitation…":"Approve and send invitation"}</button></form></section></div>}
  </section>;
}
