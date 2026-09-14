import { stripSpecifiedDetails } from "../../services/cashflow";
import type { Transaction } from "../../types";
import { dateLabel, peso } from "./formatters";

export function TransactionDetails({transaction,canEdit,onEdit}:{transaction:Transaction;canEdit:boolean;onEdit:()=>void}){
  return <div><div className="detail-grid"><div><span>Date</span><b>{dateLabel(transaction.date)}</b></div><div><span>Type</span><b>{transaction.type}</b></div>{transaction.source==="expenses" &&
 transaction.approvalStatus &&

<div>
  <span>Approval Status</span>
  <b>
    {transaction.approvalStatus}
  </b>
</div>

}{transaction.source==="expenses" &&
 transaction.approvedAt &&

<div>
  <span>Approved Date</span>
  <b>
    {dateLabel(transaction.approvedAt)}
  </b>
</div>

}{transaction.source==="expenses" &&
 transaction.rejectionReason &&

<div className="detail-full">

  <span>
    Rejection Reason
  </span>

  <b>
    {transaction.rejectionReason}
  </b>

</div>

}<div><span>Amount</span><b>{peso(transaction.moneyIn||transaction.moneyOut)}</b></div><div><span>Account</span><b>{transaction.account}</b></div><div><span>Category</span><b>{transaction.category}</b></div><div><span>Payment method</span><b>{transaction.paymentMethod||"—"}</b></div>{transaction.vendor&&<div><span>Vendor / Payee</span><b>{transaction.vendor}</b></div>}<div><span>Reference</span><b>{transaction.reference||"—"}</b></div><div className="detail-full"><span>Description</span><b>{transaction.description||"—"}</b></div>{transaction.specifiedDetails&&<div className="detail-full"><span>Specified details</span><b>{transaction.specifiedDetails}</b></div>}<div className="detail-full"><span>Notes</span><b>{stripSpecifiedDetails(transaction.notes)||"—"}</b></div><div className="detail-full"><span>Record ID</span><code>{transaction.id}</code></div></div><div className="audit-note">Edits update this record in place. Its ID remains unchanged and the database audit log records old and new values.</div>{canEdit&&<button className="primary-button form-submit" onClick={onEdit}>Edit transaction</button>}</div>;
}
