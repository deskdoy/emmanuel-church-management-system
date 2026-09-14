import type { AccountSummary } from "../../reporting/calculations";
import { VisualBars } from "./VisualBars";

type AccountBalancePanelProps = {
  accounts:AccountSummary[];
  accountMax:number;
};

export function AccountBalancePanel({accounts,accountMax}:AccountBalancePanelProps) {
  return <article className="panel"><div className="panel-head"><div><p className="eyebrow">Balance distribution</p><h2>Account balances</h2></div></div><VisualBars rows={accounts.map(row=>({label:row.name,value:row.currentBalance}))} max={accountMax}/></article>;
}
