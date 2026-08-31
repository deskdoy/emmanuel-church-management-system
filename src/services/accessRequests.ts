import { supabase } from "../lib/supabase";
import type { AccessRequest, AccessRequestInput, RoleName } from "../types";

export const accessRequestRoles: RoleName[] = ["Admin", "Pastor", "Treasurer", "Secretary", "Encoder", "Viewer"];

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
const relation = (value: unknown) => Array.isArray(value) ? value[0] : value;

export async function resolveChurchWorkspace(slug:string):Promise<{id:string;name:string;slug:string}> {
  const normalized=slug.trim().toLowerCase();
  if(!normalized)throw new Error("Enter your church workspace.");
  const {data,error}=await client().rpc("resolve_church_workspace",{p_slug:normalized});
  if(error)throw new Error("The church workspace could not be verified.");
  const church=Array.isArray(data)?data[0]:data;
  if(!church)throw new Error("No active church matches that workspace.");
  return{id:church.id,name:church.name,slug:church.slug};
}

export async function submitAccessRequest(input: AccessRequestInput) {
  const { error } = await client().from("access_requests").insert({
    church_id: input.churchId,
    full_name: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim() || null,
    requested_role: input.requestedRole,
    reason: input.reason.trim(),
  });
  if (error) {
    if (error.code === "23505") throw new Error("A pending request already exists for this email.");
    if (error.code === "23514") throw new Error("Review the form fields and try again.");
    throw new Error("Your request could not be submitted. Please try again later.");
  }
}

export async function loadAccessRequests(churchId:string): Promise<AccessRequest[]> {
  const { data, error } = await client().from("access_requests")
    .select("id,church_id,full_name,email,phone,requested_role,reason,status,approved_role,approved_by,approved_at,created_at,approved_role_data:roles!access_requests_approved_role_fkey(name),approver:users!access_requests_approved_by_fkey(full_name,email)")
    .eq("church_id",churchId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load access requests: ${error.message}`);
  return (data || []).map(row => {
    const role = relation(row.approved_role_data) as { name?: unknown } | null;
    const approver = relation(row.approver) as { full_name?: unknown; email?: unknown } | null;
    return {
      id: row.id,
      churchId: row.church_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone || "",
      requestedRole: row.requested_role as RoleName,
      reason: row.reason,
      status: row.status as AccessRequest["status"],
      approvedRoleId: row.approved_role,
      approvedRole: role?.name as RoleName || null,
      approvedBy: row.approved_by,
      approvedByName: String(approver?.full_name || approver?.email || ""),
      approvedAt: row.approved_at,
      createdAt: row.created_at,
    };
  });
}

export async function processAccessRequest(churchId:string,requestId: string, action: "approve" | "reject", approvedRole?: RoleName) {
  const { data, error } = await client().functions.invoke("manage-access-request", {
    body: { churchId, requestId, action, approvedRole },
  });
  if (error) {
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      let serverMessage = "";
      try {
        const payload = await context.clone().json() as { error?: unknown };
        serverMessage = payload.error ? String(payload.error) : "";
      } catch { /* Fall back to the generic availability message below. */ }
      if (serverMessage) throw new Error(serverMessage);
    }
    throw new Error("The access request service is unavailable. Please try again.");
  }
  if (data?.error) throw new Error(String(data.error));
  return String(data?.message || "Access request updated.");
}
