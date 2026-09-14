import type { AccountTransfer, DashboardAuditEvent, PayablePayment, Transaction } from "../../types";
import { dateTimeLabel, peso } from "./formatters";

function ActivityItem({icon,title,detail,amount,actor}:{icon:string;title:string;detail:string;amount?:number;actor?:string}) {
  return <article className="leadership-activity"><span aria-hidden="true">{icon}</span><div><b>{title}</b><small>{detail}</small>{actor&&<small>Recorded by {actor}</small>}</div>{amount!==undefined&&<strong>{peso(amount)}</strong>}</article>;
}

type DashboardActivityFeedProps = {
  isAdmin:boolean;
  latestTransaction:Transaction|undefined;
  latestPayment:(PayablePayment & {vendor:string})|undefined;
  latestTransfer:AccountTransfer|undefined;
  latestUserActivity:DashboardAuditEvent|undefined;
  actorFor:(tables:string[],recordId:string|undefined)=>string|undefined;
  onViewTransactions:()=>void;
};

export function DashboardActivityFeed({isAdmin,latestTransaction,latestPayment,latestTransfer,latestUserActivity,actorFor,onViewTransactions}:DashboardActivityFeedProps) {
  return <section className="panel leadership-activity-panel"><div className="panel-head"><div><p className="eyebrow">Latest recorded events</p><h2>Recent activity</h2></div><button className="text-button" onClick={onViewTransactions}>View transactions →</button></div><div className="leadership-activity-grid">{latestTransaction?<ActivityItem icon={latestTransaction.type==="Income"?"↓":"↑"} title={`Recent ${latestTransaction.type==="Income"?"money in":"money out"}`} detail={`${latestTransaction.category} · ${dateTimeLabel(latestTransaction.createdAt)}`} amount={latestTransaction.moneyIn||latestTransaction.moneyOut} actor={isAdmin?actorFor([latestTransaction.source],latestTransaction.id):undefined}/>:<ActivityItem icon="↕" title="Recent transaction" detail="No transaction recorded yet."/>}{latestPayment?<ActivityItem icon="✓" title="Recent payable payment" detail={`${latestPayment.vendor} · ${dateTimeLabel(latestPayment.createdAt)}`} amount={latestPayment.amount} actor={isAdmin?actorFor(["payable_payments"],latestPayment.id):undefined}/>:<ActivityItem icon="✓" title="Recent payment" detail="No payable payment recorded yet."/>}{latestTransfer?<ActivityItem icon="⇄" title="Recent transfer" detail={`${latestTransfer.fromAccount} to ${latestTransfer.toAccount} · ${dateTimeLabel(latestTransfer.createdAt)}`} amount={latestTransfer.amount} actor={isAdmin?actorFor(["account_transfers"],latestTransfer.id):undefined}/>:<ActivityItem icon="⇄" title="Recent transfer" detail="No transfer recorded yet."/>}{isAdmin&&(latestUserActivity?<ActivityItem icon="♙" title="Recent user activity" detail={`${latestUserActivity.action.toLowerCase()} · ${dateTimeLabel(latestUserActivity.createdAt)}`} actor={latestUserActivity.actorName}/>:<ActivityItem icon="♙" title="Recent user activity" detail="No recent user changes."/>)}</div>{!isAdmin&&<p className="activity-privacy-note">User and audit activity is visible only to administrators.</p>}</section>;
}
