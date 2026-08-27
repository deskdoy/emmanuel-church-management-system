import { supabase } from "../lib/supabase";
import type { Account, AccountInput, CashFlowData, Category, Payable, PayablePayment, PayablePaymentInput, Transaction, TransactionSource } from "../types";

const client = () => { if (!supabase) throw new Error("Supabase is not configured."); return supabase; };
const numeric = (value:unknown) => Number(value) || 0;
const relationName = (value:unknown) => Array.isArray(value) ? String(value[0]?.name || "") : String((value as {name?:unknown}|null)?.name || "");
const specifiedDetailsPattern = /^Specified details:\s*(.+)$/im;

export const isOtherCategory = (name:string) => /^(other|others)(\s+(income|expense))?$/i.test(name.trim());
export const extractSpecifiedDetails = (notes:string) => notes.match(specifiedDetailsPattern)?.[1]?.trim() || "";
export const stripSpecifiedDetails = (notes:string) => notes.split(/\r?\n/).filter(line=>!/^Specified details:/i.test(line.trim())).join("\n").trim();
const transactionNotes = (transaction:Transaction) => {
  const notes=stripSpecifiedDetails(transaction.notes),details=(transaction.specifiedDetails||extractSpecifiedDetails(transaction.notes)).trim();
  if(isOtherCategory(transaction.category)&&!details)throw new Error("Specify details is required for an Other category.");
  return details?[notes,`Specified details: ${details}`].filter(Boolean).join("\n"):notes;
};
const sourceFor = (type:Transaction["type"],category:string):TransactionSource => type==="Expense"?"expenses":["Donations","Fundraising"].includes(category)?"donations":"offerings";

export async function loadCashFlow():Promise<CashFlowData>{
  const db=client();
  const [accountsResult,categoriesResult,offeringsResult,donationsResult,expensesResult,payablesResult,paymentsResult]=await Promise.all([
    db.from("accounts").select("id,name,account_type,opening_balance,is_active").order("created_at"),
    db.from("categories").select("id,name,transaction_type,category_group,is_active").order("created_at"),
    db.from("offerings").select("id,offering_date,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)"),
    db.from("donations").select("id,donation_date,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)"),
    db.from("expenses").select("id,expense_date,vendor,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)"),
    db.from("payables").select("id,vendor,due_date,amount,amount_paid,status,notes,created_at,category_id,categories(name)").order("due_date"),
    db.from("payable_payments").select("id,payable_id,payment_date,amount,payment_method,reference,notes,recorded_by,recorded_by_name,created_at").order("payment_date",{ascending:false}).order("created_at",{ascending:false}),
  ]);
  const failed=[accountsResult,categoriesResult,offeringsResult,donationsResult,expensesResult,payablesResult,paymentsResult].find(result=>result.error);
  if(failed?.error)throw new Error(failed.error.message);
  const transactions:Transaction[]=[
    ...(offeringsResult.data||[]).map(row=>({id:row.id,source:"offerings" as const,date:row.offering_date,type:"Income" as const,account:relationName(row.accounts),category:relationName(row.categories),description:row.description,moneyIn:numeric(row.amount),moneyOut:0,paymentMethod:row.payment_method,reference:row.reference,notes:row.notes,specifiedDetails:extractSpecifiedDetails(row.notes),createdAt:row.created_at})),
    ...(donationsResult.data||[]).map(row=>({id:row.id,source:"donations" as const,date:row.donation_date,type:"Income" as const,account:relationName(row.accounts),category:relationName(row.categories),description:row.description,moneyIn:numeric(row.amount),moneyOut:0,paymentMethod:row.payment_method,reference:row.reference,notes:row.notes,specifiedDetails:extractSpecifiedDetails(row.notes),createdAt:row.created_at})),
    ...(expensesResult.data||[]).map(row=>({id:row.id,source:"expenses" as const,date:row.expense_date,type:"Expense" as const,account:relationName(row.accounts),category:relationName(row.categories),description:row.description,vendor:row.vendor,moneyIn:0,moneyOut:numeric(row.amount),paymentMethod:row.payment_method,reference:row.reference,notes:row.notes,specifiedDetails:extractSpecifiedDetails(row.notes),createdAt:row.created_at})),
  ].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  const accounts:Account[]=(accountsResult.data||[]).map(row=>{const related=transactions.filter(t=>t.account===row.name),moneyIn=related.reduce((s,t)=>s+t.moneyIn,0),moneyOut=related.reduce((s,t)=>s+t.moneyOut,0),openingBalance=numeric(row.opening_balance);return{id:row.id,name:row.name,type:row.account_type,openingBalance,moneyIn,moneyOut,currentBalance:openingBalance+moneyIn-moneyOut,active:row.is_active?"Yes":"No"}});
  const categories:Category[]=(categoriesResult.data||[]).map(row=>({id:row.id,name:row.name,type:row.transaction_type as "Income"|"Expense",group:row.category_group,active:row.is_active?"Yes":"No"}));
  const payments:PayablePayment[]=(paymentsResult.data||[]).map(row=>({id:row.id,payableId:row.payable_id,paymentDate:row.payment_date,amount:numeric(row.amount),paymentMethod:row.payment_method,reference:row.reference,notes:row.notes,recordedBy:row.recorded_by,recordedByName:row.recorded_by_name,createdAt:row.created_at}));
  const payables:Payable[]=(payablesResult.data||[]).map(row=>({id:row.id,vendor:row.vendor,dueDate:row.due_date,category:relationName(row.categories),categoryId:row.category_id,amount:numeric(row.amount),amountPaid:numeric(row.amount_paid),balance:numeric(row.amount)-numeric(row.amount_paid),status:row.status,notes:row.notes,createdAt:row.created_at,payments:payments.filter(payment=>payment.payableId===row.id)}));
  return{transactions,accounts,categories,payables};
}

async function currentUserId(){const {data,error}=await client().auth.getUser();if(error||!data.user)throw new Error(error?.message||"Your session has expired.");return data.user.id}

export async function addTransaction(transaction:Transaction,data:CashFlowData){
  const db=client(),account=data.accounts.find(item=>item.name===transaction.account),category=data.categories.find(item=>item.name===transaction.category&&item.type===transaction.type);
  if(!account||!category)throw new Error("The selected account or category is unavailable.");
  const recordedBy=await currentUserId(),notes=transactionNotes(transaction);
  if(transaction.type==="Expense"){
    const {error}=await db.from("expenses").insert({id:transaction.id,expense_date:transaction.date,vendor:transaction.vendor||"",description:transaction.description,amount:transaction.moneyOut,account_id:account.id,category_id:category.id,payment_method:transaction.paymentMethod,reference:transaction.reference,notes,recorded_by:recordedBy});if(error)throw new Error(error.message);return;
  }
  const table=["Donations","Fundraising"].includes(transaction.category)?"donations":"offerings";
  const values={id:transaction.id,description:transaction.description,amount:transaction.moneyIn,account_id:account.id,category_id:category.id,payment_method:transaction.paymentMethod,reference:transaction.reference,notes,recorded_by:recordedBy};
  const {error}=table==="donations"
    ?await db.from("donations").insert({...values,donation_date:transaction.date,donor_name:""})
    :await db.from("offerings").insert({...values,offering_date:transaction.date,service_name:""});
  if(error)throw new Error(error.message);
}

export async function updateTransaction(transaction:Transaction,data:CashFlowData){
  const db=client(),account=data.accounts.find(item=>item.name===transaction.account),category=data.categories.find(item=>item.name===transaction.category&&item.type===transaction.type);
  if(!account||!category)throw new Error("The selected account or category is unavailable.");
  if(sourceFor(transaction.type,transaction.category)!==transaction.source)throw new Error("Changing an income record between offering and donation sources is not supported. Create a correcting entry instead.");
  const notes=transactionNotes(transaction);
  const common={description:transaction.description,amount:transaction.type==="Income"?transaction.moneyIn:transaction.moneyOut,account_id:account.id,category_id:category.id,payment_method:transaction.paymentMethod,reference:transaction.reference,notes};
  const query=transaction.source==="expenses"
    ?db.from("expenses").update({...common,expense_date:transaction.date,vendor:transaction.vendor||""}).eq("id",transaction.id)
    :transaction.source==="donations"
      ?db.from("donations").update({...common,donation_date:transaction.date}).eq("id",transaction.id)
      :db.from("offerings").update({...common,offering_date:transaction.date}).eq("id",transaction.id);
  const {error}=await query.select("id").single();
  if(error)throw new Error(error.message);
}

export async function addPayable(payable:Payable){
  const recordedBy=await currentUserId();
  const {error}=await client().from("payables").insert({id:payable.id,vendor:payable.vendor,due_date:payable.dueDate,category_id:payable.categoryId,amount:payable.amount,amount_paid:payable.amountPaid,status:payable.status,notes:payable.notes,recorded_by:recordedBy});
  if(error)throw new Error(error.message);
}

export async function recordPayablePayment(payment:PayablePaymentInput){
  if(!Number.isFinite(payment.amount)||payment.amount<=0)throw new Error("Enter a valid payment amount.");
  const recordedBy=await currentUserId();
  const {error}=await client().from("payable_payments").insert({payable_id:payment.payableId,payment_date:payment.paymentDate,amount:payment.amount,payment_method:payment.paymentMethod,reference:payment.reference,notes:payment.notes,recorded_by:recordedBy}).select("id").single();
  if(error)throw new Error(error.message);
}

const accountValues=(account:AccountInput)=>({name:account.name.trim(),account_type:account.type,opening_balance:account.openingBalance,is_active:account.active});

export async function createAccount(account:AccountInput){
  if(!account.name.trim())throw new Error("Account name is required.");
  const {error}=await client().from("accounts").insert(accountValues(account)).select("id").single();
  if(error)throw new Error(error.message);
}

export async function updateAccount(accountId:string,account:AccountInput){
  if(!account.name.trim())throw new Error("Account name is required.");
  const {error}=await client().from("accounts").update(accountValues(account)).eq("id",accountId).select("id").single();
  if(error)throw new Error(error.message);
}
