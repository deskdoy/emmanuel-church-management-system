import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { extractSpecifiedDetails, isOtherCategory, stripSpecifiedDetails } from "../../services/cashflow";
import type { CashFlowData as Data, CashFlowMutation, Transaction } from "../../types";
import { peso, today } from "./formatters";

export type TransactionType = "Income" | "Expense" | "Transfer";

export function TransactionForm({ data, initialType, transaction, saving, onSubmit }: { data: Data; initialType: TransactionType; transaction?:Transaction; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(initialType);
  const {activeChurch}=useActiveChurch();
  const churchId=activeChurch?.id;
  const [configuredPaymentMethods,setConfiguredPaymentMethods]=useState<{churchId:string;names:string[];failed:boolean}|null>(null);
  useEffect(()=>{
    if(!supabase||!churchId)return;
    const db=supabase;
    let cancelled=false;
    void (async()=>{
      try{
        const {data:methods,error}=await db.from("payment_methods").select("name").eq("church_id",churchId).eq("is_active",true).order("name");
        if(error)throw error;
        if(!cancelled)setConfiguredPaymentMethods({churchId,names:(methods||[]).map(method=>method.name),failed:false});
      }catch{
        if(!cancelled)setConfiguredPaymentMethods({churchId,names:[],failed:true});
      }
    })();
    return()=>{cancelled=true;};
  },[churchId]);
  const currentPaymentMethods=configuredPaymentMethods?.churchId===churchId?configuredPaymentMethods:null;
  const paymentMethods=[...new Set([transaction?.paymentMethod||"Cash",...(currentPaymentMethods?.names||[])])];
  const sourceCategories=(nextType:TransactionType)=>data.categories.filter(category=>{
    if(nextType==="Transfer")return false;
    if(category.type!==nextType||category.active==="No")return false;
    if(!transaction||transaction.source==="expenses")return true;
    const donationCategory=["Donations","Fundraising"].includes(category.name);
    return transaction.source==="donations"?donationCategory:!donationCategory;
  });
  const initialCategory=transaction?.category||sourceCategories(initialType)[0]?.name||"";
  const [categoryName,setCategoryName]=useState(initialCategory);
  const accounts = data.accounts.filter(account => account.active !== "No" || account.name===transaction?.account);
  const categories = sourceCategories(type);
  const changeType=(nextType:TransactionType)=>{if(transaction)return;setType(nextType);setCategoryName(sourceCategories(nextType)[0]?.name||"");};
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), amount = Number(form.get("amount"));
    if(type==="Transfer"){
      void onSubmit({action:"addTransfer",transfer:{id:crypto.randomUUID(),date:String(form.get("date")||""),fromAccountId:String(form.get("fromAccountId")||""),toAccountId:String(form.get("toAccountId")||""),amount,reference:String(form.get("reference")||""),notes:String(form.get("notes")||"")}});
      return;
    }
    const category=String(form.get("category")||""),vendor=type==="Expense"?String(form.get("vendor")||""):"";
    const source=transaction?.source||(type==="Expense"?"expenses":["Donations","Fundraising"].includes(category)?"donations":"offerings");
    const value:Transaction={id:transaction?.id||crypto.randomUUID(),source,date:String(form.get("date")||""),type,account:String(form.get("account")||""),category,description:
  String(form.get("description") || "") ||
  transaction?.description ||
  vendor ||
  category,vendor,moneyIn:type==="Income"?amount:0,moneyOut:type==="Expense"?amount:0,paymentMethod:String(form.get("paymentMethod")||transaction?.paymentMethod||"Cash"),reference:String(form.get("reference")||""),notes:String(form.get("notes")||""),specifiedDetails:String(form.get("specifiedDetails")||""),createdAt:transaction?.createdAt||new Date().toISOString()};
    void onSubmit({action:transaction?"updateTransaction":"addTransaction",transaction:value});
  };
  return <form className="record-form" onSubmit={submit}>
    <div className="segmented transaction-types">
      <button type="button" disabled={!!transaction} className={type==="Income"?"selected":""} onClick={()=>changeType("Income")}>Money In</button>
      <button type="button" disabled={!!transaction} className={type==="Expense"?"selected expense":""} onClick={()=>changeType("Expense")}>Money Out</button>
      <button type="button" disabled={!!transaction} className={type==="Transfer"?"selected transfer":""} onClick={()=>changeType("Transfer")}>Transfer</button>
    </div>
    {type==="Transfer"?<div className="form-grid">
      <label>Amount (PHP)<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" required /></label>
      <label>Date<input name="date" type="date" defaultValue={today} required /></label>
      <label>From Account<select name="fromAccountId" required>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} &middot; {peso(account.currentBalance)}</option>)}</select></label>
      <label>To Account<select name="toAccountId" defaultValue={accounts[1]?.id||""} required>{accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Reference (optional)<input name="reference" placeholder="Transfer reference no." /></label>
      <label className="full">Notes (optional)<textarea name="notes" rows={3} placeholder="Optional transfer notes" /></label>
      <p className="form-help full">Transfers move money between accounts only. They are excluded from income, expense, net cash flow, analytics, and reports.</p>
    </div>:<div className="form-grid">
      <label>Amount (PHP)<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={transaction?transaction.moneyIn||transaction.moneyOut:undefined} placeholder="0.00" required /></label>
      <label>Date<input name="date" type="date" defaultValue={transaction?.date||today} required /></label>
      <label>Account<select name="account" defaultValue={transaction?.account} required>{accounts.map(account=><option key={account.id} value={account.name}>{account.name}</option>)}</select></label>
      <label>Category<select name="category" value={categoryName} onChange={event=>setCategoryName(event.target.value)} required>{categories.map(category=><option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
      {isOtherCategory(categoryName)&&<label className="full">
        {type==="Expense"?"Specify Other Expense Details":"Specify Other Income Details"}
        <input
          name="specifiedDetails"
          defaultValue={transaction?.specifiedDetails||extractSpecifiedDetails(transaction?.notes||"")}
          placeholder={type==="Expense"?"Describe the purpose of this expense":"Describe the source of this income"}
          required
        />
      </label>}
      {type==="Expense"&&<label className="full">
        Vendor / Payee
        <input name="vendor" defaultValue={transaction?.vendor||""} placeholder="Who was paid?" required />
      </label>}
      <label>Payment Method
        <select name="paymentMethod" defaultValue={transaction?.paymentMethod||"Cash"} required>
          {paymentMethods.map(method=><option key={method} value={method}>{method}</option>)}
        </select>
      </label>
      <label>Reference (optional)<input name="reference" defaultValue={transaction?.reference||""} placeholder="Receipt or reference no." /></label>
      {currentPaymentMethods?.failed&&<p className="form-help full" role="status">Church payment methods could not be loaded. The current payment method is still available.</p>}
      <label className="full">Description (optional)
        <input name="description" defaultValue={transaction?.description||""} placeholder={type==="Expense"?"What was this expense for?":"Describe this income"} />
      </label>
      <label className="full">Notes (optional)
        <textarea name="notes" rows={3} defaultValue={stripSpecifiedDetails(transaction?.notes||"")} placeholder="Optional notes" />
      </label>
    </div>}
    {transaction&&<p className="audit-note">This saves over the original record ID. Supabase audit logs retain the previous and updated values.</p>}
    <button className="primary-button form-submit" disabled={saving||accounts.length<(type==="Transfer"?2:1)||(type!=="Transfer"&&!categories.length)}>{saving?"Saving\u2026":transaction?"Save transaction changes":type==="Income"?"Save money in":type==="Expense"?"Save money out":"Save transfer"}</button>
  </form>;
}
