import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountSummaries, buildCashFlowStatement, buildDashboardKpis, buildIncomeExpenseReport, monthDateRange, validateDateRange } from "../src/reporting/calculations.ts";
import { buildReportCsv } from "../src/reporting/exportCsv.ts";

const transaction=(id,date,type,account,category,amount)=>({id,source:type==="Income"?"offerings":"expenses",date,type,account,category,description:category,moneyIn:type==="Income"?amount:0,moneyOut:type==="Expense"?amount:0,paymentMethod:"Cash",reference:"",notes:"",createdAt:`${date}T08:00:00Z`});
const data={
  accounts:[
    {id:"cash",name:"Cash on Hand",type:"Cash",openingBalance:1000,moneyIn:0,moneyOut:0,transferIn:0,transferOut:0,currentBalance:0,active:"Yes"},
    {id:"bank",name:"Bank Account",type:"Bank",openingBalance:500,moneyIn:0,moneyOut:0,transferIn:0,transferOut:0,currentBalance:0,active:"Yes"},
  ],
  transactions:[
    transaction("pre","2025-12-31","Income","Cash on Hand","Tithes",100),
    transaction("tithe","2026-01-03","Income","Cash on Hand","Tithes",200),
    transaction("offering","2026-01-04","Income","Cash on Hand","Offerings",300),
    transaction("donation","2026-01-05","Income","Bank Account","Donations",400),
    transaction("fundraising","2026-01-06","Income","Cash on Hand","Fundraising",100),
    transaction("other-income","2026-01-07","Income","Bank Account","Other Income",50),
    transaction("utilities","2026-01-08","Expense","Cash on Hand","Utilities",250),
    transaction("other-expense","2026-01-09","Expense","Bank Account","Other Expense",50),
    transaction("after","2026-02-01","Income","Cash on Hand","Offerings",100),
  ],
  transfers:[
    {id:"pre-transfer",date:"2025-12-30",fromAccountId:"cash",fromAccount:"Cash on Hand",toAccountId:"bank",toAccount:"Bank Account",amount:100,reference:"",notes:"",recordedBy:"u",recordedByName:"Admin",createdAt:"2025-12-30T08:00:00Z"},
    {id:"period-transfer",date:"2026-01-10",fromAccountId:"cash",fromAccount:"Cash on Hand",toAccountId:"bank",toAccount:"Bank Account",amount:200,reference:"",notes:"",recordedBy:"u",recordedByName:"Admin",createdAt:"2026-01-10T08:00:00Z"},
  ],
  categories:[],
  payables:[{id:"p",vendor:"Vendor",dueDate:"2026-01-20",category:"Utilities",categoryId:"c",amount:500,amountPaid:125,balance:375,status:"Partially Paid",notes:"",createdAt:"",payments:[]}],
};

test("monthly and custom date ranges are inclusive and validated",()=>{
  assert.deepEqual(monthDateRange("2026-02"),{start:"2026-02-01",end:"2026-02-28"});
  assert.deepEqual(monthDateRange("2024-02"),{start:"2024-02-01",end:"2024-02-29"});
  assert.deepEqual(validateDateRange({start:"2026-01-01",end:"2026-01-31"}),{start:"2026-01-01",end:"2026-01-31"});
  assert.throws(()=>validateDateRange({start:"2026-02-01",end:"2026-01-01"}),/Start date/);
});

test("cash flow statement classifies categories and excludes transfers",()=>{
  const statement=buildCashFlowStatement(data,{start:"2026-01-01",end:"2026-01-31"});
  assert.equal(statement.beginningBalance,1600);
  assert.deepEqual(statement.moneyIn,{tithes:200,offerings:300,donations:400,otherIncome:150,total:1050});
  assert.deepEqual(statement.moneyOut,{expenses:250,otherExpenses:50,total:300});
  assert.equal(statement.endingBalance,2350);
  const withHugeTransfer={...data,transfers:[...data.transfers,{...data.transfers[1],id:"huge",amount:99999}]};
  assert.deepEqual(buildCashFlowStatement(withHugeTransfer,{start:"2026-01-01",end:"2026-01-31"}),statement);
  assert.deepEqual(buildIncomeExpenseReport(withHugeTransfer.transactions,{start:"2026-01-01",end:"2026-01-31"}),{totalIncome:1050,totalExpenses:300,netAvailableFunds:750});
});

test("transfers affect individual account balances but preserve organization total",()=>{
  const summaries=buildAccountSummaries(data),cash=summaries.find(row=>row.id==="cash"),bank=summaries.find(row=>row.id==="bank");
  assert.equal(cash.transferOut,300);assert.equal(cash.currentBalance,1250);
  assert.equal(bank.transferIn,300);assert.equal(bank.currentBalance,1200);
  assert.equal(cash.currentBalance+bank.currentBalance,2450);
  const withoutTransfers=buildAccountSummaries({...data,transfers:[]});
  assert.equal(withoutTransfers.reduce((sum,row)=>sum+row.currentBalance,0),2450);
});

test("dashboard KPIs use the current month and current account balances",()=>{
  assert.deepEqual(buildDashboardKpis(data,3,new Date(2026,0,15)),{currentBalance:2450,currentMonthIncome:1050,currentMonthExpenses:300,outstandingPayables:375,activeProjects:3});
});

test("CSV exports include leadership report metadata",()=>{
  const csv=buildReportCsv({organization:"Emmanuel Cash Flow",title:"Cash Flow Statement",scopeLabel:"January 1–31, 2026",headers:["Item","Amount"],rows:[["Ending Balance",2350]],filename:"report.csv"});
  assert.match(csv,/Emmanuel Cash Flow/);assert.match(csv,/Cash Flow Statement/);assert.match(csv,/January 1–31, 2026/);assert.match(csv,/Ending Balance/);
});
