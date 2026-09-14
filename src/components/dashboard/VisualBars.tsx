import { EmptyState } from "../ui/EmptyState";
import { peso } from "./formatters";

export function VisualBars({rows,max}:{rows:{label:string;value:number}[];max:number}) {
  return <div className="dashboard-visual-bars">{rows.map(row=><div key={row.label}><span>{row.label}</span><i><em style={{width:`${Math.max(row.value?3:0,row.value/max*100)}%`}}/></i><b>{peso(row.value)}</b></div>)}{!rows.length&&<EmptyState compact title="Insights will appear here" description="Record your first financial activity to begin building this view."/>}</div>;
}
