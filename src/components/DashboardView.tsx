import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAccountSummaries, buildDashboardKpis, buildExpenseCategoryBreakdown, buildMonthlyTrend, monthDateRange } from "../reporting/calculations";
import { loadDashboardAuditActivity } from "../services/auditLogs";
import { loadProjects } from "../services/projects";
import type { CashFlowData, DashboardAuditEvent, Project, ProjectGoalView } from "../types";
import { DashboardMetrics, DashboardMetricsSkeleton } from "./dashboard/DashboardMetrics";
import { DashboardQuickActions } from "./dashboard/DashboardQuickActions";
import { FinancialTrendChart } from "./dashboard/FinancialTrendChart";
import { ExpenseCategoryPanel } from "./dashboard/ExpenseCategoryPanel";
import { BudgetHealthCard } from "./dashboard/BudgetHealthCard";
import { AccountBalancePanel } from "./dashboard/AccountBalancePanel";
import { DashboardActivityFeed } from "./dashboard/DashboardActivityFeed";
import { ProjectGoalsPanel } from "./ProjectGoalsPanel";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";

type DashboardViewProps = {
  churchId:string;
  data:CashFlowData;
  isAdmin:boolean;
  canWriteFinance:boolean;
  canApproveFinance:boolean;
  onViewTransactions:()=>void;
  onRecordIncome:()=>void;
  onRecordExpense:()=>void;
  onReviewApprovals:()=>void;
  dataLoading?:boolean;
};

export function DashboardView({churchId,data,isAdmin,canWriteFinance,canApproveFinance,onViewTransactions,onRecordIncome,onRecordExpense,onReviewApprovals,dataLoading=false}:DashboardViewProps) {
  const [projects,setProjects]=useState<Project[]>([]),[auditEvents,setAuditEvents]=useState<DashboardAuditEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const reportingDate=useMemo(()=>new Date(),[]);
  const refresh=useCallback(async()=>{setLoading(true);setError("");const [projectsResult,auditResult]=await Promise.allSettled([loadProjects(churchId),isAdmin?loadDashboardAuditActivity(churchId):Promise.resolve([])]);if(projectsResult.status==="fulfilled")setProjects(projectsResult.value);else setError(projectsResult.reason instanceof Error?projectsResult.reason.message:"Unable to load project reporting.");if(auditResult.status==="fulfilled")setAuditEvents(auditResult.value);else if(isAdmin)setError(current=>current|| (auditResult.reason instanceof Error?auditResult.reason.message:"Unable to load recent activity."));setLoading(false);},[churchId,isAdmin]);
  useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]);
  const month=monthDateRange(`${reportingDate.getFullYear()}-${String(reportingDate.getMonth()+1).padStart(2,"0")}`);
  const activeProjects=projects.filter(project=>project.status==="Active").length,kpis=useMemo(()=>buildDashboardKpis(data,activeProjects,reportingDate),[activeProjects,data,reportingDate]);
  const trend=useMemo(()=>buildMonthlyTrend(data.transactions,6,reportingDate),[data.transactions,reportingDate]),expenses=useMemo(()=>buildExpenseCategoryBreakdown(data.transactions,month),[data.transactions,month]),accounts=useMemo(()=>buildAccountSummaries(data),[data]);
  const trendMax=Math.max(1,...trend.flatMap(row=>[row.income,row.expenses])),expenseMax=Math.max(1,...expenses.map(row=>row.amount)),accountMax=Math.max(1,...accounts.map(row=>Math.max(0,row.currentBalance)));
  const pendingApprovalCount=useMemo(()=>data.transactions.filter(transaction=>transaction.type==="Expense"&&transaction.approvalStatus==="pending").length,[data.transactions]);
  const metricsClassName=`leadership-metrics${canApproveFinance?" approvals-metrics":""}`;
  const latestTransaction=[...data.transactions].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const latestPayment=data.payables.flatMap(payable=>payable.payments.map(payment=>({...payment,vendor:payable.vendor}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const latestTransfer=[...data.transfers].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const latestUserActivity=auditEvents.find(event=>["church_memberships","users","access_requests"].includes(event.tableName));
  const actorFor=(tables:string[],recordId:string|undefined)=>recordId?auditEvents.find(event=>tables.includes(event.tableName)&&event.recordId===recordId)?.actorName:"";
  const goals:ProjectGoalView[]=projects.flatMap(project=>project.funding.goalAmount!==null&&project.funding.currentAmountRaised!==null&&project.funding.progressPercentage!==null?[{projectId:project.id,projectName:project.name,goalAmount:project.funding.goalAmount,amountRaised:project.funding.currentAmountRaised,progressPercentage:project.funding.progressPercentage,targetDate:project.funding.targetDate}]:[]);
  if(dataLoading)return <section className="leadership-dashboard dashboard-loading" aria-busy="true"><DashboardMetricsSkeleton metricsClassName={metricsClassName} canApproveFinance={canApproveFinance}/><section className="panel"><LoadingSkeleton rows={5} label="Loading dashboard insights"/></section></section>;
  return <section className="leadership-dashboard">{error&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>void refresh()}>Try again</button></div>}
    <DashboardQuickActions
      canWriteFinance={canWriteFinance}
      canApproveFinance={canApproveFinance}
      onRecordIncome={onRecordIncome}
      onRecordExpense={onRecordExpense}
      onReviewApprovals={onReviewApprovals}
    />
    <DashboardMetrics
      metricsClassName={metricsClassName}
      canApproveFinance={canApproveFinance}
      kpis={kpis}
      payables={data.payables}
      pendingApprovalCount={pendingApprovalCount}
    />
    {canApproveFinance && <BudgetHealthCard churchId={churchId} data={data} asOf={reportingDate} />}
    <section className="dashboard-reporting-grid">
      <FinancialTrendChart trend={trend} trendMax={trendMax}/>
      <ExpenseCategoryPanel expenses={expenses} expenseMax={expenseMax}/>
      <AccountBalancePanel accounts={accounts} accountMax={accountMax}/>
    </section>
    <DashboardActivityFeed
      isAdmin={isAdmin}
      latestTransaction={latestTransaction}
      latestPayment={latestPayment}
      latestTransfer={latestTransfer}
      latestUserActivity={latestUserActivity}
      actorFor={actorFor}
      onViewTransactions={onViewTransactions}
    />
    <ProjectGoalsPanel goals={goals}/>{loading&&<div className="dashboard-refresh" role="status"><span className="inline-spinner"/>Refreshing leadership insights…</div>}</section>;
}
