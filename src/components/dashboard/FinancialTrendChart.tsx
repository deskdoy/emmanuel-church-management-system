import type { buildMonthlyTrend } from "../../reporting/calculations";
import { EmptyState } from "../ui/EmptyState";

type FinancialTrendChartProps = {
  trend:ReturnType<typeof buildMonthlyTrend>;
  trendMax:number;
};

export function FinancialTrendChart({trend,trendMax}:FinancialTrendChartProps) {
  return <article className="panel dashboard-trend"><div className="panel-head"><div><p className="eyebrow">Six-month view</p><h2>Income trend</h2></div><span className="period-button">Income vs expenses</span></div>{trend.some(row=>row.income||row.expenses)?<><div className="live-chart"><div className="grid-lines"><i/><i/><i/><i/></div>{trend.map(row=><div className="month-group" key={row.month}><div className="month-bars"><i style={{height:`${Math.max(row.income?5:1,row.income/trendMax*100)}%`}}/><i className="expense-bar" style={{height:`${Math.max(row.expenses?5:1,row.expenses/trendMax*100)}%`}}/></div><span>{row.label}</span></div>)}</div><div className="legend"><span><i/>Income</span><span><i className="legend-out"/>Expenses</span></div></>:<EmptyState compact title="Your financial story starts here" description="Income and expense trends will appear after your first transactions are recorded."/>}</article>;
}
