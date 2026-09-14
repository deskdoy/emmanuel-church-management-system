import type { buildDashboardKpis } from "../../reporting/calculations";
import type { CashFlowData } from "../../types";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { peso } from "./formatters";

type MetricsLayoutProps = {
  metricsClassName:string;
  canApproveFinance:boolean;
};

type DashboardMetricsProps = MetricsLayoutProps & {
  kpis:ReturnType<typeof buildDashboardKpis>;
  payables:CashFlowData["payables"];
  pendingApprovalCount:number;
};

export function DashboardMetrics({metricsClassName,canApproveFinance,kpis,payables,pendingApprovalCount}:DashboardMetricsProps) {
  return <section className={metricsClassName}><article className="metric-card featured"><div className="metric-label">Current Balance <span>↗</span></div><strong>{peso(kpis.currentBalance)}</strong><p>Across all recorded accounts</p></article><article className="metric-card"><div className="metric-label">Current Month Income</div><strong className="income-text">{peso(kpis.currentMonthIncome)}</strong><p>Transfers excluded</p></article><article className="metric-card"><div className="metric-label">Current Month Expenses</div><strong>{peso(kpis.currentMonthExpenses)}</strong><p>Transfers excluded</p></article><article className="metric-card"><div className="metric-label">Outstanding Payables</div><strong>{peso(kpis.outstandingPayables)}</strong><p>{payables.filter(payable=>payable.balance>0).length} open items</p></article><article className="metric-card"><div className="metric-label">Active Projects</div><strong>{kpis.activeProjects}</strong><p>Current church initiatives</p></article>{canApproveFinance&&<article className="metric-card"><div className="metric-label">Pending Financial Approvals</div><strong>{pendingApprovalCount}</strong><p>Expenses awaiting review across all dates</p></article>}</section>;
}

export function DashboardMetricsSkeleton({metricsClassName,canApproveFinance}:MetricsLayoutProps) {
  return <div className={`${metricsClassName} skeleton-metrics`}>{Array.from({length:canApproveFinance?6:5},(_,index)=><article className="metric-card" key={index}><LoadingSkeleton rows={1} label="Loading financial summary"/></article>)}</div>;
}
