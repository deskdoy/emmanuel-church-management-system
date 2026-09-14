import type { Account, CashFlowData, Payable, Transaction } from "../types";

export type DateRange={start:string;end:string};
export type CashFlowStatement={
  beginningBalance:number;
  moneyIn:{tithes:number;offerings:number;donations:number;otherIncome:number;total:number};
  moneyOut:{expenses:number;otherExpenses:number;total:number};
  endingBalance:number;
};
export type AccountSummary={id:string;name:string;type:string;openingBalance:number;income:number;expenses:number;transferIn:number;transferOut:number;totalInflow:number;totalOutflow:number;currentBalance:number};

const sum=(values:number[])=>values.reduce((total,value)=>total+(Number(value)||0),0);
const normalize=(value:string)=>value.trim().toLowerCase();
const isOtherExpense=(category:string)=>/^others?\s+expenses?$/i.test(category.trim());
const inRange=(date:string,range:DateRange)=>date>=range.start&&date<=range.end;
const isReportableTransaction=(row:Transaction)=>row.type==="Income"||row.approvalStatus==="approved";
const formatDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

export function monthDateRange(month:string):DateRange {
  const [yearValue,monthValue]=month.split("-").map(Number);
  if(!yearValue||!monthValue||monthValue<1||monthValue>12)throw new Error("Select a valid report month.");
  return{start:`${yearValue}-${String(monthValue).padStart(2,"0")}-01`,end:formatDate(new Date(yearValue,monthValue,0))};
}

export function validateDateRange(range:DateRange):DateRange {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(range.start)||!/^\d{4}-\d{2}-\d{2}$/.test(range.end))throw new Error("Choose a complete report date range.");
  if(range.start>range.end)throw new Error("Start date must be on or before end date.");
  return range;
}

function accountBalance(data:Pick<CashFlowData,"transactions"|"transfers">,account:Account,predicate:(date:string)=>boolean) {
  const transactionNet=sum(data.transactions.filter(row=>isReportableTransaction(row)&&row.account===account.name&&predicate(row.date)).map(row=>row.moneyIn-row.moneyOut));
  const transferNet=sum(data.transfers.filter(row=>predicate(row.date)&&row.toAccountId===account.id).map(row=>row.amount))-sum(data.transfers.filter(row=>predicate(row.date)&&row.fromAccountId===account.id).map(row=>row.amount));
  return account.openingBalance+transactionNet+transferNet;
}

export function buildCashFlowStatement(data:CashFlowData,rangeInput:DateRange):CashFlowStatement {
  const range=validateDateRange(rangeInput),period=data.transactions.filter(row=>isReportableTransaction(row)&&inRange(row.date,range));
  const income=period.filter(row=>row.type==="Income"),expenses=period.filter(row=>row.type==="Expense");
  const tithes=sum(income.filter(row=>normalize(row.category)==="tithes").map(row=>row.moneyIn));
  const offerings=sum(income.filter(row=>normalize(row.category)==="offerings").map(row=>row.moneyIn));
  const donations=sum(income.filter(row=>normalize(row.category)==="donations").map(row=>row.moneyIn));
  const otherIncome=sum(income.filter(row=>!["tithes","offerings","donations"].includes(normalize(row.category))).map(row=>row.moneyIn));
  const otherExpenses=sum(expenses.filter(row=>isOtherExpense(row.category)).map(row=>row.moneyOut));
  const regularExpenses=sum(expenses.filter(row=>!isOtherExpense(row.category)).map(row=>row.moneyOut));
  const beginningBalance=sum(data.accounts.map(account=>accountBalance(data,account,date=>date<range.start)));
  const totalIncome=tithes+offerings+donations+otherIncome,totalExpenses=regularExpenses+otherExpenses;
  return{beginningBalance,moneyIn:{tithes,offerings,donations,otherIncome,total:totalIncome},moneyOut:{expenses:regularExpenses,otherExpenses,total:totalExpenses},endingBalance:beginningBalance+totalIncome-totalExpenses};
}

export function buildIncomeExpenseReport(transactions:Transaction[],rangeInput:DateRange) {
  const range=validateDateRange(rangeInput),period=transactions.filter(row=>isReportableTransaction(row)&&inRange(row.date,range));
  const totalIncome=sum(period.map(row=>row.moneyIn)),totalExpenses=sum(period.map(row=>row.moneyOut));
  return{totalIncome,totalExpenses,netAvailableFunds:totalIncome-totalExpenses};
}

export function buildAccountSummaries(data:Pick<CashFlowData,"accounts"|"transactions"|"transfers">):AccountSummary[] {
  return data.accounts.map(account=>{
    const rows=data.transactions.filter(row=>isReportableTransaction(row)&&row.account===account.name),income=sum(rows.map(row=>row.moneyIn)),expenses=sum(rows.map(row=>row.moneyOut));
    const transferIn=sum(data.transfers.filter(row=>row.toAccountId===account.id).map(row=>row.amount)),transferOut=sum(data.transfers.filter(row=>row.fromAccountId===account.id).map(row=>row.amount));
    const totalInflow=income+transferIn,totalOutflow=expenses+transferOut;
    return{id:account.id,name:account.name,type:account.type,openingBalance:account.openingBalance,income,expenses,transferIn,transferOut,totalInflow,totalOutflow,currentBalance:account.openingBalance+totalInflow-totalOutflow};
  });
}

export function buildPayablesReport(payables:Payable[]) {
  return payables.map(payable=>({id:payable.id,vendor:payable.vendor,dueDate:payable.dueDate,amount:payable.amount,paidAmount:payable.amountPaid,remainingBalance:payable.balance,status:payable.status}));
}

export function buildExpenseCategoryBreakdown(transactions:Transaction[],range?:DateRange) {
  const totals=new Map<string,number>();
  for(const row of transactions){if(row.type!=="Expense"||!isReportableTransaction(row)||(range&&!inRange(row.date,range)))continue;totals.set(row.category,(totals.get(row.category)||0)+row.moneyOut);}
  return [...totals].map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount);
}

export function buildMonthlyTrend(transactions:Transaction[],count=6,asOf=new Date()) {
  return Array.from({length:count},(_,index)=>{
    const date=new Date(asOf.getFullYear(),asOf.getMonth()-count+1+index,1),month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    const rows=transactions.filter(row=>isReportableTransaction(row)&&row.date.startsWith(month));
    return{month,label:date.toLocaleString("en",{month:"short"}),income:sum(rows.map(row=>row.moneyIn)),expenses:sum(rows.map(row=>row.moneyOut))};
  });
}

export function buildDashboardKpis(data:Pick<CashFlowData,"accounts"|"transactions"|"transfers"|"payables">,activeProjects:number,asOf=new Date()) {
  const range=monthDateRange(`${asOf.getFullYear()}-${String(asOf.getMonth()+1).padStart(2,"0")}`),period=buildIncomeExpenseReport(data.transactions,range);
  return{currentBalance:sum(buildAccountSummaries(data).map(account=>account.currentBalance)),currentMonthIncome:period.totalIncome,currentMonthExpenses:period.totalExpenses,outstandingPayables:sum(data.payables.map(payable=>payable.balance)),activeProjects};
}
