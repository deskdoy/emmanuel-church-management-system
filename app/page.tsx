"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../src/auth/AuthContext";
import { addPayable, addTransaction, createAccount, loadCashFlow, recordPayablePayment, updateAccount } from "../src/services/cashflow";
import type { Account, CashFlowData as Data, CashFlowMutation, Payable, Transaction } from "../src/types";

type View = "dashboard" | "transactions" | "income" | "expenses" | "payables" | "accounts" | "reports" | "analytics";
type TransactionType = "Income" | "Expense";
type ModalName = "transaction" | "payable" | "payable-payment" | "account" | null;

const emptyData: Data = { transactions: [], payables: [], accounts: [], categories: [] };
const today = new Date().toISOString().slice(0, 10);
const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
const Icon = ({ children }: { children: ReactNode }) => <span className="nav-icon" aria-hidden="true">{children}</span>;

function Modal({ title, eyebrow = "New record", onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div>
      {children}
    </section>
  </div>;
}

function ReadOnlyNotice({ message }: { message: string }) {
  return <div className="permission-banner" role="status"><span aria-hidden="true">◉</span><div><b>Read-only access</b><p>{message}</p></div></div>;
}

function TransactionTable({ transactions, emptyMessage }: { transactions: Transaction[]; emptyMessage: string }) {
  return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Account</th><th>Category</th><th className="num">Amount</th></tr></thead><tbody>
    {[...transactions].sort((a, b) => b.date.localeCompare(a.date)).map(transaction => <tr key={transaction.id}>
      <td>{dateLabel(transaction.date)}</td><td><b>{transaction.description || "—"}</b><small>{transaction.reference || transaction.paymentMethod}</small></td><td><span className={`status ${transaction.type.toLowerCase()}`}>{transaction.type}</span></td><td>{transaction.account}</td><td>{transaction.category}</td><td className={`num ${transaction.type === "Income" ? "income-text" : ""}`}>{transaction.type === "Income" ? "+" : "-"}{peso(transaction.moneyIn || transaction.moneyOut)}</td>
    </tr>)}
    {!transactions.length && <tr><td colSpan={6} className="blank-row">{emptyMessage}</td></tr>}
  </tbody></table></div>;
}

export default function Home() {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<Data>(emptyData);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>("Income");
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const [reportStart, setReportStart] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [reportEnd, setReportEnd] = useState(today);

  const canWriteFinance = !!profile && ["Admin", "Treasurer", "Encoder"].includes(profile.role);
  const canManageAccounts = !!profile && ["Admin", "Treasurer"].includes(profile.role);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadCashFlow()); setConnected(true); }
    catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Unable to load financial data."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const totals = useMemo(() => {
    const moneyIn = data.transactions.reduce((sum, transaction) => sum + Number(transaction.moneyIn || 0), 0);
    const moneyOut = data.transactions.reduce((sum, transaction) => sum + Number(transaction.moneyOut || 0), 0);
    return { moneyIn, moneyOut, balance: data.accounts.reduce((sum, account) => sum + Number(account.currentBalance || 0), 0), net: moneyIn - moneyOut, payables: data.payables.reduce((sum, payable) => sum + Number(payable.balance || 0), 0) };
  }, [data]);
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const income = data.transactions.filter(transaction => transaction.type === "Income");
  const expenses = data.transactions.filter(transaction => transaction.type === "Expense");
  const expenseByCategory = useMemo(() => Object.entries(data.transactions.reduce<Record<string, number>>((summary, transaction) => {
    if (transaction.moneyOut) summary[transaction.category] = (summary[transaction.category] || 0) + Number(transaction.moneyOut);
    return summary;
  }, {})).sort((a, b) => b[1] - a[1]), [data.transactions]);
  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
      const rows = data.transactions.filter(transaction => transaction.date.startsWith(key));
      return { label: month.toLocaleString("en", { month: "short" }), income: rows.reduce((sum, transaction) => sum + Number(transaction.moneyIn || 0), 0), expense: rows.reduce((sum, transaction) => sum + Number(transaction.moneyOut || 0), 0) };
    });
  }, [data.transactions]);
  const maxMonth = Math.max(1, ...monthly.flatMap(month => [month.income, month.expense]));
  const reportRows = data.transactions.filter(transaction => transaction.date >= reportStart && transaction.date <= reportEnd);
  const reportIn = reportRows.reduce((sum, transaction) => sum + Number(transaction.moneyIn || 0), 0);
  const reportOut = reportRows.reduce((sum, transaction) => sum + Number(transaction.moneyOut || 0), 0);

  const openTransaction = (type: TransactionType) => { if (canWriteFinance) { setTransactionType(type); setModal("transaction"); } };
  const openPayablePayment = (payable: Payable) => { if (canWriteFinance) { setSelectedPayable(payable); setModal("payable-payment"); } };
  const openAccount = (account: Account | null) => { if (canManageAccounts) { setSelectedAccount(account); setModal("account"); } };
  const closeModal = () => { setModal(null); setSelectedPayable(null); setSelectedAccount(null); };
  const save = async (payload: CashFlowMutation) => {
    setSaving(true); setNotice("Saving…"); setError("");
    try {
      if (payload.action === "addTransaction") await addTransaction(payload.transaction, data);
      if (payload.action === "addPayable") await addPayable(payload.payable);
      if (payload.action === "recordPayablePayment") await recordPayablePayment(payload.payableId, payload.paymentAmount);
      if (payload.action === "saveAccount") {
        if (payload.account.id) await updateAccount(payload.account.id, payload.account);
        else await createAccount(payload.account);
      }
      await refresh(); setNotice("Saved securely"); closeModal(); window.setTimeout(() => setNotice(""), 2800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record."); setNotice("Could not save. Review the message above.");
    } finally { setSaving(false); }
  };
  const exportCsv = () => {
    const lines = [["Date", "Type", "Account", "Category", "Description", "Money In", "Money Out"], ...reportRows.map(transaction => [transaction.date, transaction.type, transaction.account, transaction.category, transaction.description, transaction.moneyIn, transaction.moneyOut])].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" })); anchor.download = `emmanuel-cash-flow-${reportStart}-to-${reportEnd}.csv`; anchor.click(); URL.revokeObjectURL(anchor.href);
  };

  const headings: Record<View, [string, string]> = {
    dashboard: ["Good morning, Emmanuel.", "Here’s how your cash is moving today."], transactions: ["Transaction ledger", "Every peso in and out, in one clean record."], income: ["Income records", "Review and record money received by the church."], expenses: ["Expense records", "Track every outgoing payment and operating cost."], payables: ["Payables", "Manage commitments, balances, and payments due."], accounts: ["Accounts", "Manage cash and bank accounts without losing history."], reports: ["Report generator", "Create a clear, date-based cash flow statement."], analytics: ["Cash flow analytics", "See the patterns behind your financial activity."],
  };
  const navItems: [View, string, string][] = [["dashboard", "⌂", "Dashboard"], ["transactions", "↕", "Transactions"], ["income", "↓", "Income"], ["expenses", "↑", "Expenses"], ["payables", "◷", "Payables"], ["accounts", "◎", "Accounts"], ["reports", "▤", "Reports"], ["analytics", "◫", "Analytics"]];
  const showFinanceNotice = !canWriteFinance && ["transactions", "income", "expenses", "payables"].includes(view);
  const headerActions = () => {
    if (["dashboard", "transactions"].includes(view)) return <div className="header-actions"><button className="primary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Income")}>＋ Record Income</button><button className="secondary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Expense")}>＋ Record Expense</button></div>;
    if (view === "income") return <button className="primary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Income")}>＋ Record Income</button>;
    if (view === "expenses") return <button className="primary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Expense")}>＋ Record Expense</button>;
    if (view === "payables") return <button className="primary-button" disabled={!canWriteFinance} onClick={() => setModal("payable")}>＋ Add Payable</button>;
    if (view === "accounts") return <button className="primary-button" disabled={!canManageAccounts} onClick={() => openAccount(null)}>＋ New Account</button>;
    return null;
  };

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">E</span><span>Emmanuel<br /><b>Cash Flow</b></span></div><nav aria-label="Main navigation">{navItems.map(([key, icon, label]) => <button key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => setView(key)}><Icon>{icon}</Icon>{label}</button>)}</nav><div className="sidebar-foot"><div className="connection-state"><div className={`sync-dot ${connected ? "" : "pending"}`} /><span>{connected ? "Database connected" : "Connection pending"}</span></div><div className="signed-in-user"><b>{profile?.fullName || profile?.email}</b><small>{profile?.role}</small></div><button className="sign-out-button" onClick={() => void signOut()}>Sign out</button></div></aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1>{headings[view][0]}</h1><p className="subhead">{headings[view][1]}</p></div>{headerActions()}</header>
      {notice && <div className="toast" role="status">{notice}</div>}{error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
      {showFinanceNotice && <ReadOnlyNotice message={`${profile?.role || "Your role"} can review financial records, but only Admin, Treasurer, and Encoder accounts can create or update them.`} />}
      {view === "accounts" && !canManageAccounts && <ReadOnlyNotice message={`${profile?.role || "Your role"} can review account balances, but only Admin and Treasurer accounts can manage accounts.`} />}

      {view === "dashboard" && <><section className="metrics"><article className="metric-card featured"><div className="metric-label">Available balance <span>↗</span></div><strong>{peso(totals.balance)}</strong><p>Across {data.accounts.filter(account => account.active !== "No").length} active accounts</p></article><article className="metric-card"><div className="metric-label">Money in <span className="badge positive">All time</span></div><strong>{peso(totals.moneyIn)}</strong><p className="positive-text">Income recorded</p></article><article className="metric-card"><div className="metric-label">Money out <span className="badge">All time</span></div><strong>{peso(totals.moneyOut)}</strong><p>Expenses recorded</p></article><article className="metric-card"><div className="metric-label">Payables <span>→</span></div><strong>{peso(totals.payables)}</strong><p>{data.payables.filter(payable => payable.balance > 0).length} open items</p></article></section>
        <section className="dashboard-grid"><article className="panel cashflow-panel"><div className="panel-head"><div><p className="eyebrow">Overview</p><h2>Cash flow</h2></div><span className="period-button">Last 6 months</span></div><div className="live-chart"><div className="grid-lines"><i /><i /><i /><i /></div>{monthly.map(month => <div className="month-group" key={month.label}><div className="month-bars"><i className="income-bar" style={{ height: `${Math.max(month.income ? 5 : 1, month.income / maxMonth * 100)}%` }} /><i className="expense-bar" style={{ height: `${Math.max(month.expense ? 5 : 1, month.expense / maxMonth * 100)}%` }} /></div><span>{month.label}</span></div>)}</div><div className="legend"><span><i />Money in</span><span><i className="legend-out" />Money out</span></div></article><article className="panel activity-panel"><div className="panel-head"><div><p className="eyebrow">Ledger</p><h2>Recent activity</h2></div><button className="text-button" onClick={() => setView("transactions")}>View all →</button></div>{recent.length ? <div className="activity-list">{recent.map(transaction => <div className="activity" key={transaction.id}><span className={`activity-mark ${transaction.type.toLowerCase()}`}>{transaction.type === "Income" ? "↓" : "↑"}</span><div><b>{transaction.description || transaction.category}</b><small>{dateLabel(transaction.date)} · {transaction.account}</small></div><strong className={transaction.type === "Income" ? "income-text" : ""}>{transaction.type === "Income" ? "+" : "-"}{peso(transaction.moneyIn || transaction.moneyOut)}</strong></div>)}</div> : <div className="empty-state"><div className="empty-icon">↕</div><h3>Your ledger is ready</h3><p>{canWriteFinance ? "Use Record Income or Record Expense to add the first entry." : "No transactions have been recorded yet."}</p></div>}</article></section></>}
      {view === "transactions" && <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">{data.transactions.length} records</p><h2>All transactions</h2></div></div><TransactionTable transactions={data.transactions} emptyMessage="No transactions yet." /></section>}
      {view === "income" && <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">{income.length} income records</p><h2>Money received</h2></div><strong className="panel-total income-text">{peso(totals.moneyIn)}</strong></div><TransactionTable transactions={income} emptyMessage="No income has been recorded." /></section>}
      {view === "expenses" && <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">{expenses.length} expense records</p><h2>Money spent</h2></div><strong className="panel-total">{peso(totals.moneyOut)}</strong></div><TransactionTable transactions={expenses} emptyMessage="No expenses have been recorded." /></section>}
      {view === "payables" && <section className="panel table-panel payables-panel"><div className="panel-head"><div><p className="eyebrow">{data.payables.filter(payable => payable.balance > 0).length} open items</p><h2>All payables</h2></div><strong className="panel-total">{peso(totals.payables)}</strong></div><div className="table-wrap"><table><thead><tr><th>Due</th><th>Vendor / Payee</th><th>Category</th><th>Amount</th><th>Paid</th><th>Status</th><th className="num">Balance</th><th>Action</th></tr></thead><tbody>{data.payables.map(payable => <tr key={payable.id}><td>{dateLabel(payable.dueDate)}</td><td><b>{payable.vendor}</b></td><td>{payable.category}</td><td>{peso(payable.amount)}</td><td>{peso(payable.amountPaid)}</td><td><span className={`status ${payable.status.toLowerCase().replaceAll(" ", "-")}`}>{payable.status}</span></td><td className="num">{peso(payable.balance)}</td><td><button className="table-action" disabled={!canWriteFinance || payable.balance <= 0} onClick={() => openPayablePayment(payable)}>{payable.balance > 0 ? "Record payment" : "Paid"}</button></td></tr>)}{!data.payables.length && <tr><td colSpan={8} className="blank-row">No payables recorded.</td></tr>}</tbody></table></div></section>}
      {view === "accounts" && <section className="account-cards">{data.accounts.map(account => <article className={`account-card ${account.active === "No" ? "inactive" : ""}`} key={account.id}><div className="account-card-head"><span>{account.type}</span><span className={`status ${account.active === "No" ? "unpaid" : "paid"}`}>{account.active === "No" ? "Inactive" : "Active"}</span></div><h3>{account.name}</h3><strong>{peso(account.currentBalance)}</strong><div className="account-breakdown"><small>Money in <b>{peso(account.moneyIn)}</b></small><small>Money out <b>{peso(account.moneyOut)}</b></small></div><button className="outline-button account-action" disabled={!canManageAccounts} onClick={() => openAccount(account)}>Manage account</button></article>)}{!data.accounts.length && !loading && <div className="empty-mini">No accounts are available.</div>}</section>}
      {view === "reports" && <section className="report-layout"><article className="panel report-controls no-print"><p className="eyebrow">Reporting period</p><h2>Build your statement</h2><label>Start date<input type="date" value={reportStart} onChange={event => setReportStart(event.target.value)} /></label><label>End date<input type="date" value={reportEnd} onChange={event => setReportEnd(event.target.value)} /></label><button className="secondary-button" onClick={() => window.print()}>Print / Save PDF</button><button className="outline-button" onClick={exportCsv}>Export CSV</button></article><article className="panel report-sheet"><div className="report-brand"><span className="brand-mark">E</span><div><h2>Emmanuel Cash Flow</h2><p>Cash flow statement</p></div></div><div className="report-period">{dateLabel(reportStart)} — {dateLabel(reportEnd)}</div><div className="report-summary"><div><span>Money in</span><strong>{peso(reportIn)}</strong></div><div><span>Money out</span><strong>{peso(reportOut)}</strong></div><div className="report-net"><span>Net cash flow</span><strong>{peso(reportIn - reportOut)}</strong></div></div><h3>Transaction detail</h3><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="num">In</th><th className="num">Out</th></tr></thead><tbody>{reportRows.map(transaction => <tr key={transaction.id}><td>{dateLabel(transaction.date)}</td><td>{transaction.description}</td><td>{transaction.category}</td><td className="num">{transaction.moneyIn ? peso(transaction.moneyIn) : "—"}</td><td className="num">{transaction.moneyOut ? peso(transaction.moneyOut) : "—"}</td></tr>)}{!reportRows.length && <tr><td colSpan={5} className="blank-row">No activity in this period.</td></tr>}</tbody></table><footer>Generated by Emmanuel Cash Flow · Source: Emmanuel database</footer></article></section>}
      {view === "analytics" && <section className="analytics-grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">Trend</p><h2>Inflow vs outflow</h2></div><span className={`net-pill ${totals.net < 0 ? "negative" : ""}`}>{totals.net >= 0 ? "Positive" : "Negative"} cash flow</span></div><div className="big-number"><span>Net cash flow</span><strong>{peso(totals.net)}</strong></div><div className="analytics-bars">{monthly.map(month => <div key={month.label}><span>{month.label}</span><div className="track"><i style={{ width: `${month.income / maxMonth * 100}%` }} /><em style={{ width: `${month.expense / maxMonth * 100}%` }} /></div><small>{peso(month.income)} in · {peso(month.expense)} out</small></div>)}</div></article><article className="panel"><div className="panel-head"><div><p className="eyebrow">Expenses</p><h2>By category</h2></div></div><div className="category-list">{expenseByCategory.length ? expenseByCategory.slice(0, 8).map(([name, value]) => <div key={name}><div><span>{name}</span><b>{peso(value)}</b></div><i><em style={{ width: `${value / (expenseByCategory[0]?.[1] || 1) * 100}%` }} /></i></div>) : <div className="empty-mini">Category insights will appear after expenses are recorded.</div>}</div></article></section>}
    </section>
    {modal === "transaction" && canWriteFinance && <Modal title={transactionType === "Income" ? "Record income" : "Record expense"} onClose={closeModal}><TransactionForm data={data} initialType={transactionType} saving={saving} onSubmit={save} /></Modal>}
    {modal === "payable" && canWriteFinance && <Modal title="Add payable" onClose={closeModal}><PayableForm data={data} saving={saving} onSubmit={save} /></Modal>}
    {modal === "payable-payment" && canWriteFinance && selectedPayable && <Modal eyebrow="Update payable" title={`Payment to ${selectedPayable.vendor}`} onClose={closeModal}><PayablePaymentForm payable={selectedPayable} saving={saving} onSubmit={save} /></Modal>}
    {modal === "account" && canManageAccounts && <Modal eyebrow="Account management" title={selectedAccount ? "Edit account" : "Add account"} onClose={closeModal}><AccountForm account={selectedAccount} saving={saving} onSubmit={save} /></Modal>}
    {loading && <div className="loading-line" />}
  </main>;
}

function TransactionForm({ data, initialType, saving, onSubmit }: { data: Data; initialType: TransactionType; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(initialType);
  const accounts = data.accounts.filter(account => account.active !== "No");
  const categories = data.categories.filter(category => category.type === type && category.active !== "No");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); void onSubmit({ action: "addTransaction", transaction: { id: crypto.randomUUID(), date: String(form.get("date") || ""), type, account: String(form.get("account") || ""), category: String(form.get("category") || ""), description: String(form.get("description") || ""), vendor: type === "Expense" ? String(form.get("vendor") || "") : "", moneyIn: type === "Income" ? amount : 0, moneyOut: type === "Expense" ? amount : 0, paymentMethod: String(form.get("paymentMethod") || ""), reference: String(form.get("reference") || ""), notes: String(form.get("notes") || ""), createdAt: new Date().toISOString() } }); };
  return <form className="record-form" onSubmit={submit}><div className="segmented"><button type="button" className={type === "Income" ? "selected" : ""} onClick={() => setType("Income")}>Money in</button><button type="button" className={type === "Expense" ? "selected expense" : ""} onClick={() => setType("Expense")}>Money out</button></div><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={today} required /></label><label>Amount (PHP)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label>Account<select name="account" required>{accounts.map(account => <option key={account.id} value={account.name}>{account.name}</option>)}</select></label><label>Category<select name="category" required>{categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>{type === "Expense" && <label className="full">Vendor / Payee<input name="vendor" placeholder="Who was paid?" /></label>}<label className="full">Description<input name="description" placeholder="What was this for?" required /></label><label>Payment method<select name="paymentMethod"><option>Cash</option><option>Bank Transfer</option><option>Check</option><option>Card</option><option>Online</option><option>Other</option></select></label><label>Reference<input name="reference" placeholder="Receipt or reference no." /></label><label className="full">Notes<textarea name="notes" rows={3} placeholder="Optional notes" /></label></div><button className="primary-button form-submit" disabled={saving || !accounts.length || !categories.length}>{saving ? "Saving…" : type === "Income" ? "Save income" : "Save expense"}</button></form>;
}

function PayableForm({ data, saving, onSubmit }: { data: Data; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const expenseCategories = data.categories.filter(category => category.type === "Expense" && category.active !== "No");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); const categoryId = String(form.get("categoryId") || ""); const category = data.categories.find(item => item.id === categoryId); if (!category) return; void onSubmit({ action: "addPayable", payable: { id: crypto.randomUUID(), vendor: String(form.get("vendor") || ""), dueDate: String(form.get("dueDate") || ""), category: category.name, categoryId, amount, amountPaid: 0, balance: amount, status: "Unpaid", notes: String(form.get("notes") || ""), createdAt: new Date().toISOString() } }); };
  return <form className="record-form" onSubmit={submit}><div className="form-grid"><label className="full">Vendor / Payee<input name="vendor" placeholder="Who needs to be paid?" required /></label><label>Due date<input name="dueDate" type="date" defaultValue={today} required /></label><label>Amount (PHP)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label className="full">Category<select name="categoryId" required>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="full">Notes<textarea name="notes" rows={3} /></label></div><button className="primary-button form-submit" disabled={saving || !expenseCategories.length}>{saving ? "Saving…" : "Save payable"}</button></form>;
}

function PayablePaymentForm({ payable, saving, onSubmit }: { payable: Payable; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({ action: "recordPayablePayment", payableId: payable.id, paymentAmount: Number(form.get("paymentAmount")) }); };
  return <form className="record-form" onSubmit={submit}><div className="payment-summary"><div><span>Original amount</span><b>{peso(payable.amount)}</b></div><div><span>Already paid</span><b>{peso(payable.amountPaid)}</b></div><div><span>Remaining balance</span><b>{peso(payable.balance)}</b></div></div><div className="form-grid"><label className="full">Payment amount (PHP)<input name="paymentAmount" type="number" min="0.01" max={payable.balance} step="0.01" defaultValue={payable.balance} required /></label></div><button className="primary-button form-submit" disabled={saving}>{saving ? "Saving…" : "Record payment"}</button></form>;
}

function AccountForm({ account, saving, onSubmit }: { account: Account | null; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({ action: "saveAccount", account: { id: account?.id, name: String(form.get("name") || ""), type: String(form.get("type") || "Cash") as "Cash" | "Bank" | "Other", openingBalance: Number(form.get("openingBalance")), active: String(form.get("active")) === "true" } }); };
  return <form className="record-form" onSubmit={submit}><div className="form-grid"><label className="full">Account name<input name="name" defaultValue={account?.name || ""} placeholder="Account name" required /></label><label>Account type<select name="type" defaultValue={account?.type || "Cash"}><option>Cash</option><option>Bank</option><option>Other</option></select></label><label>Opening balance (PHP)<input name="openingBalance" type="number" step="0.01" defaultValue={account?.openingBalance || 0} required /></label><label className="full">Status<select name="active" defaultValue={account?.active === "No" ? "false" : "true"}><option value="true">Active</option><option value="false">Inactive</option></select></label></div><p className="form-help">Deactivating an account keeps its transaction history while removing it from new entry forms.</p><button className="primary-button form-submit" disabled={saving}>{saving ? "Saving…" : account ? "Save account changes" : "Create account"}</button></form>;
}
