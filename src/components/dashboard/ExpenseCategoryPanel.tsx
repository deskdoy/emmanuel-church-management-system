import type { buildExpenseCategoryBreakdown } from "../../reporting/calculations";
import { VisualBars } from "./VisualBars";

type ExpenseCategoryPanelProps = {
  expenses:ReturnType<typeof buildExpenseCategoryBreakdown>;
  expenseMax:number;
};

export function ExpenseCategoryPanel({expenses,expenseMax}:ExpenseCategoryPanelProps) {
  return <article className="panel"><div className="panel-head"><div><p className="eyebrow">Current month</p><h2>Expense categories</h2></div></div><VisualBars rows={expenses.slice(0,6).map(row=>({label:row.category,value:row.amount}))} max={expenseMax}/></article>;
}
