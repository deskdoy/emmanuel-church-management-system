"use client";

import { FormEvent, Fragment, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../src/auth/AuthContext";
import { supabase } from "../src/lib/supabase";
import { useActiveChurch } from "../src/tenancy/ActiveChurchContext";
import { accountManagerRoles, financeWriterRoles, hasChurchRole, projectManagerRoles } from "../src/tenancy/permissions";
import { AuditLogsView } from "../src/components/AuditLogsView";
import { BackupCenterView } from "../src/components/BackupCenterView";
import { DashboardView } from "../src/components/DashboardView";
import { ProjectsView } from "../src/components/ProjectsView";
import { ReportsView } from "../src/components/ReportsView";
import { SettingsView } from "../src/components/SettingsView";
import { FinancialApprovalView } from "../src/components/FinancialApprovalView";
import { SystemInformationView } from "../src/components/SystemInformationView";
import { MembersView } from "../src/components/MembersView";
import { CategoryManagementView } from "../src/components/CategoryManagementView";
import { PaymentMethodsView } from "../src/components/PaymentMethodsView";
import { OfferingsView } from "../src/components/OfferingsView";
import { DonationsView } from "../src/components/DonationsView";
import { ExpensesView } from "../src/components/ExpensesView";
import { UsersView } from "../src/components/UsersView";
import { PlatformAdministrationView } from "../src/components/PlatformAdministrationView";
import { AppIcon, type IconName } from "../src/components/ui/AppIcon";
import { ChurchBrand } from "../src/components/ui/ChurchBrand";
import { EmptyState } from "../src/components/ui/EmptyState";
import { PageTransition } from "../src/components/ui/PageTransition";
import { UserProfileIndicator } from "../src/components/ui/UserProfileIndicator";
import { ActiveChurchIdentity, ChurchWorkspaceSwitcher } from "../src/components/tenancy/ChurchWorkspaceSwitcher";
import { addPayable, addTransaction, addTransfer, createAccount, extractSpecifiedDetails, isOtherCategory, loadCashFlow, recordPayablePayment, stripSpecifiedDetails, updateAccount, updateTransaction } from "../src/services/cashflow";
import type { Account, AccountTransfer, CashFlowData as Data, CashFlowMutation, Payable, Transaction } from "../src/types";

type View =
  | "dashboard"
  | "transactions"
  | "offerings"
  | "donations"
  | "expenses"
  | "payables"
  | "accounts"
  | "categories"
  | "payment-methods"
  | "projects"
  | "reports"
  | "members"
  | "users"
  | "audit"
  | "backup"
  | "system"
  | "settings"
  | "financial-approvals";
const navigationSections = ["Overview", "Finance", "Ministry", "Administration"] as const;
const navigationSectionByView: Record<View, typeof navigationSections[number]> = {
  dashboard: "Overview",
  transactions: "Finance",
  offerings: "Finance",
  donations: "Finance",
  expenses: "Finance",
  payables: "Finance",
  accounts: "Finance",
  categories: "Finance",
  "payment-methods": "Finance",
  reports: "Finance",
  "financial-approvals": "Finance",
  projects: "Ministry",
  members: "Ministry",
  users: "Administration",
  audit: "Administration",
  backup: "Administration",
  system: "Administration",
  settings: "Administration",
};

type TransactionType = "Income" | "Expense" | "Transfer";
type TransactionFilter = "all" | "income" | "expenses" | "transfers";
type ModalName = "transaction" | "transaction-details" | "transaction-edit" | "payable" | "payable-payment" | "payable-details" | "account" | null;

const emptyData: Data = { transactions: [], transfers: [], payables: [], accounts: [], categories: [] };
const today = new Date().toISOString().slice(0, 10);
const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";

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

function TransactionTable({ transactions, emptyMessage, canEdit, onDetails, onEdit }: { transactions: Transaction[]; emptyMessage: string; canEdit: boolean; onDetails: (transaction:Transaction)=>void; onEdit: (transaction:Transaction)=>void }) {
  return <div className="table-wrap responsive-table"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Account</th><th>Category</th><th className="num">Amount</th><th>Action</th></tr></thead><tbody>
    {[...transactions].sort((a, b) => b.date.localeCompare(a.date)).map(transaction => <tr key={transaction.id}>
      <td data-label="Date">{dateLabel(transaction.date)}</td><td data-label="Description"><b>{transaction.description || "—"}</b><small>{transaction.reference || transaction.paymentMethod}</small></td><td data-label="Type"><span className={`status ${transaction.type.toLowerCase()}`}>{transaction.type}</span></td><td data-label="Account">{transaction.account}</td><td data-label="Category">{transaction.category}</td><td data-label="Amount" className={`num ${transaction.type === "Income" ? "income-text" : ""}`}>{transaction.type === "Income" ? "+" : "-"}{peso(transaction.moneyIn || transaction.moneyOut)}</td><td data-label="Actions"><div className="row-actions"><button className="table-action" onClick={()=>onDetails(transaction)}>Details</button>{canEdit&&<button className="table-action" onClick={()=>onEdit(transaction)}>Edit</button>}</div></td>
    </tr>)}
    {!transactions.length && <tr><td colSpan={7} className="blank-row"><EmptyState compact title="No transactions yet" description={emptyMessage}/></td></tr>}
  </tbody></table></div>;
}

function TransferHistory({ transfers }: { transfers: AccountTransfer[] }) {
  return <section className="panel transfer-history-panel"><div className="panel-head"><div><p className="eyebrow">{transfers.length} transfer{transfers.length===1?"":"s"}</p><h2>Transfer history</h2></div><span className="status transfer">Balance only</span></div><div className="table-wrap responsive-table"><table><thead><tr><th>Date</th><th>From account</th><th>To account</th><th>Reference</th><th>Recorded by</th><th className="num">Amount</th></tr></thead><tbody>{transfers.map(transfer=><tr key={transfer.id}><td data-label="Date">{dateLabel(transfer.date)}</td><td data-label="From account"><b>{transfer.fromAccount}</b></td><td data-label="To account"><b>{transfer.toAccount}</b><small>{transfer.notes||"Internal account transfer"}</small></td><td data-label="Reference">{transfer.reference||"—"}</td><td data-label="Recorded by">{transfer.recordedByName}</td><td data-label="Amount" className="num">{peso(transfer.amount)}</td></tr>)}{!transfers.length&&<tr><td colSpan={6} className="blank-row"><EmptyState compact title="No transfers yet" description="Transfers between church accounts will appear here without affecting income or expense totals."/></td></tr>}</tbody></table></div></section>;
}

export default function Home(){
  const {isPlatformOwner}=useAuth();
  const {workspaceMode}=useActiveChurch();
  return isPlatformOwner&&workspaceMode==="platform"?<PlatformAdministrationView/>:<ChurchWorkspace/>;
}

function ChurchWorkspace() {
  const {profile,refreshAuthorization,signOut}=useAuth();
  const {activeChurch,activeRole}=useActiveChurch();
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<Data>(emptyData);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>("Income");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [transactionFilter,setTransactionFilter]=useState<TransactionFilter>("all");

  const canWriteFinance=hasChurchRole(activeRole,financeWriterRoles);
  const canManageAccounts=hasChurchRole(activeRole,accountManagerRoles);
  const isChurchAdmin=activeRole==="Admin";
  const canApproveFinance =
  activeRole==="Admin" ||
  activeRole==="Treasurer";
  const churchProfile=profile&&activeRole?{...profile,role:activeRole}:null;
  const firstName=(profile?.fullName||profile?.email||"Steward").trim().split(/\s+/)[0];
  const hour=new Date().getHours(),greeting=hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    if(!activeChurch){setData(emptyData);setConnected(false);setLoading(false);return;}
    try { setData(await loadCashFlow(activeChurch.id)); setConnected(true); }
    catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Unable to load financial data."); }
    finally { setLoading(false); }
  }, [activeChurch]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("drawer-open");
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("drawer-open"); };
  }, [mobileNavOpen]);

  const totals = useMemo(() => {
    const moneyIn = data.transactions.reduce((sum, transaction) => sum + Number(transaction.moneyIn || 0), 0);
    const moneyOut = data.transactions.reduce((sum, transaction) => sum + Number(transaction.moneyOut || 0), 0);
    return { moneyIn, moneyOut, payables: data.payables.reduce((sum, payable) => sum + Number(payable.balance || 0), 0) };
  }, [data]);
  const income = data.transactions.filter(transaction => transaction.type === "Income");
  const expenses = data.transactions.filter(transaction => transaction.type === "Expense");

  const openTransaction = (type: TransactionType) => { if (canWriteFinance) { setTransactionType(type); setModal("transaction"); } };
  const openTransactionDetails = (transaction:Transaction) => { setSelectedTransaction(transaction); setModal("transaction-details"); };
  const openTransactionEdit = (transaction:Transaction) => { if(canWriteFinance){ setSelectedTransaction(transaction); setTransactionType(transaction.type); setModal("transaction-edit"); } };
  const openPayablePayment = (payable: Payable) => { if (canWriteFinance) { setSelectedPayable(payable); setModal("payable-payment"); } };
  const openPayableDetails = (payable:Payable) => { setSelectedPayable(payable); setModal("payable-details"); };
  const openAccount = (account: Account | null) => { if (canManageAccounts) { setSelectedAccount(account); setModal("account"); } };
  const closeModal = () => { setModal(null); setSelectedTransaction(null); setSelectedPayable(null); setSelectedAccount(null); };
  const save = async (payload: CashFlowMutation) => {
    if(!activeChurch){setError("Choose a church workspace before saving.");return;}
    setSaving(true); setNotice("Saving…"); setError("");
    try {
      if (payload.action === "addTransaction") await addTransaction(activeChurch.id,payload.transaction, data);
      if (payload.action === "updateTransaction") await updateTransaction(activeChurch.id,payload.transaction, data);
      if (payload.action === "addPayable") await addPayable(activeChurch.id,payload.payable);
      if (payload.action === "recordPayablePayment") await recordPayablePayment(activeChurch.id,payload.payment);
      if (payload.action === "addTransfer") await addTransfer(activeChurch.id,payload.transfer, data);
      if (payload.action === "saveAccount") {
        if (payload.account.id) await updateAccount(activeChurch.id,payload.account.id, payload.account);
        else await createAccount(activeChurch.id,payload.account);
      }
      await refresh(); setNotice("Saved securely"); closeModal(); window.setTimeout(() => setNotice(""), 2800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record."); setNotice("Could not save. Review the message above.");
    } finally { setSaving(false); }
  };
  const headings: Record<View, [string, string]> = {

  dashboard: [
    `${greeting}, ${firstName}.`,
    "Welcome to your Faithful Steward financial stewardship workspace."
  ],

  transactions: [
    "Transactions",
    "Record and review money in, money out, and transfers."
  ],

  offerings: [
  "Offerings",
  "Record worship offerings and church collections."
],

donations: [
  "Donations",
  "Record member and special donations."
],

expenses: [
  "Expenses",
  "Record church expenses and payments."
],

  payables: [
    "Payables",
    "Manage commitments, balances, and payments due."
  ],

  accounts: [
    "Accounts",
    "Manage cash and bank accounts without losing history."
  ],

  categories: [
    "Categories",
    "Manage income and expense categories for your church."
  ],

  "payment-methods": [
    "Payment Methods",
    "Manage accepted payment methods for your church."
  ],

  projects: [
    "Projects",
    "Plan and follow church initiatives in one place."
  ],

  reports: [
    "Reports",
    "Generate statements and review cash flow analytics."
  ],

  members: [
    "Members",
    "Manage church members, profiles, and ministry information."
  ],

  users: [
    "Users",
    "Manage approved users, roles, and account status."
  ],

  audit: [
    "Audit logs",
    "Review secured, immutable records of activity across the system."
  ],

  backup: [
    "Backup Center",
    "Generate audited browser-only exports for church records."
  ],

  system: [
    "System Information",
    "Review application health and operational usage."
  ],

  settings: [
    "Settings",
    "Review your account and application configuration."
  ],

  "financial-approvals": [
  "Financial Approvals",
  "Review and approve pending financial records."
],

};
  const navItems: [View, IconName, string][] = [
["dashboard", "dashboard", "Dashboard"],
["transactions","transactions","Transactions"],
["offerings","transactions","Offerings"],
["donations","transactions","Donations"],
["expenses","transactions","Expenses"],
["payables","payables","Payables"],
["accounts", "accounts", "Accounts"],
["categories", "accounts", "Categories"],
["payment-methods","accounts","Payment Methods"],
["projects", "projects", "Projects"],
["reports", "reports", "Reports"]
];
  if(isChurchAdmin)
navItems.push(
 ["members","users","Members"],
 ["users","users","Users"],["audit","audit","Audit Logs"],["backup","backup","Backup Center"],["system","system","System Information"]);
 if(canApproveFinance)
  navItems.push(
    [
      "financial-approvals",
      "transactions",
      "Financial Approvals"
    ]
  );
  navItems.push(["settings", "settings", "Settings"]);
  const showFinanceNotice = !canWriteFinance && ["transactions", "payables"].includes(view);
  const headerActions = () => {
    if (["dashboard", "transactions"].includes(view)) return <button className="primary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Income")}><AppIcon name="plus" size={17}/>New Transaction</button>;
    if (view === "payables") return <button className="primary-button" disabled={!canWriteFinance} onClick={() => setModal("payable")}><AppIcon name="plus" size={17}/>Add Payable</button>;
    if (view === "accounts") return <button className="primary-button" disabled={!canManageAccounts} onClick={() => openAccount(null)}><AppIcon name="plus" size={17}/>New Account</button>;
    return null;
  };

  return <main className="app-shell">
    <button type="button" className="mobile-menu-button" aria-label="Open navigation menu" aria-controls="main-sidebar" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}><span /><span /><span /></button>
    <button type="button" className={`sidebar-overlay ${mobileNavOpen?"open":""}`} aria-label="Close navigation menu" onClick={()=>setMobileNavOpen(false)} />
    <aside id="main-sidebar" className={`sidebar mobile-drawer ${mobileNavOpen?"open":""}`}><div className="brand"><ChurchBrand inverse/></div><ChurchWorkspaceSwitcher onSwitched={()=>setMobileNavOpen(false)}/><nav aria-label="Main navigation">
        {navigationSections.map(section => (
          <Fragment key={section}>
            <p className="nav-section-label">{section}</p>
            {navItems.filter(([key]) => navigationSectionByView[key] === section).map(([key, icon, label]) => (
              <button
                key={key}
                title={label}
                className={`nav-item ${view === key ? "active" : ""}`}
                aria-current={view===key?"page":undefined}
                onClick={() => { setView(key); setMobileNavOpen(false); }}
              >
                <span className="nav-icon"><AppIcon name={icon}/></span>
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </Fragment>
        ))}
        <button className="nav-item logout-nav" onClick={()=>{setMobileNavOpen(false);void signOut();}}><span className="nav-icon"><AppIcon name="logout"/></span><span className="nav-label">Logout</span></button></nav><div className="sidebar-foot">{profile&&activeRole&&<UserProfileIndicator name={profile.fullName} email={profile.email} role={activeRole}/>}<div className="connection-state"><div className={`sync-dot ${connected ? "" : "pending"}`} /><span>{connected ? "Database connected" : "Connection pending"}</span></div></div></aside>
    <section className="workspace">
      <header className="topbar"><div className="welcome-heading"><div className="workspace-heading-line"><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><ActiveChurchIdentity/></div><h1>{headings[view][0]}</h1><p className="subhead">{headings[view][1]}</p></div><div className="topbar-actions"><ChurchWorkspaceSwitcher compact/>{profile&&activeRole&&<UserProfileIndicator name={profile.fullName} email={profile.email} role={activeRole} compact/>}{headerActions()}</div></header>
      {notice && <div className="toast" role="status">{notice}</div>}{error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
      {showFinanceNotice && <ReadOnlyNotice message={`${activeRole||"Your role"} can review financial records, but only Church Admin, Treasurer, and Encoder accounts can create or update them.`} />}
      {view === "accounts" && !canManageAccounts && <ReadOnlyNotice message={`${activeRole||"Your role"} can review account balances, but only Church Admin and Treasurer accounts can manage accounts.`} />}

      <PageTransition key={view} pageKey={view}>
      {view === "dashboard" && activeChurch&&<DashboardView
        churchId={activeChurch.id}
        data={data}
        isAdmin={isChurchAdmin}
        canWriteFinance={canWriteFinance}
        canApproveFinance={canApproveFinance}
        dataLoading={loading}
        onViewTransactions={() => setView("transactions")}
        onRecordIncome={() => openTransaction("Income")}
        onRecordExpense={() => openTransaction("Expense")}
        onReviewApprovals={() => setView("financial-approvals")}
      />}
      {view === "transactions" && <div className="transaction-workspace"><section className="transaction-overview"><article><span className="transaction-overview-icon income"><AppIcon name="transactions"/></span><div><small>Money In</small><strong>{peso(totals.moneyIn)}</strong><p>{income.length} recorded entr{income.length===1?"y":"ies"}</p></div></article><article><span className="transaction-overview-icon expense"><AppIcon name="transactions"/></span><div><small>Money Out</small><strong>{peso(totals.moneyOut)}</strong><p>{expenses.length} recorded entr{expenses.length===1?"y":"ies"}</p></div></article><article><span className="transaction-overview-icon transfer"><AppIcon name="transactions"/></span><div><small>Account Transfers</small><strong>{data.transfers.length}</strong><p>Balance movements only</p></div></article></section><div className="transaction-toolbar"><div className="module-tabs transaction-filters" aria-label="Transaction type"><button className={transactionFilter==="all"?"active":""} onClick={()=>setTransactionFilter("all")}>All</button><button className={transactionFilter==="income"?"active":""} onClick={()=>setTransactionFilter("income")}>Money In <span>{income.length}</span></button><button className={transactionFilter==="expenses"?"active":""} onClick={()=>setTransactionFilter("expenses")}>Money Out <span>{expenses.length}</span></button><button className={transactionFilter==="transfers"?"active":""} onClick={()=>setTransactionFilter("transfers")}>Transfers <span>{data.transfers.length}</span></button></div><p>Choose a transaction type to review its ledger.</p></div><div className="transaction-ledgers">{["all","income"].includes(transactionFilter)&&<section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">{income.length} records</p><h2>Money In</h2></div><strong className="panel-total income-text">{peso(totals.moneyIn)}</strong></div><TransactionTable transactions={income} emptyMessage="Record tithes, offerings, donations, and other church income here." canEdit={canWriteFinance} onDetails={openTransactionDetails} onEdit={openTransactionEdit}/></section>}{["all","expenses"].includes(transactionFilter)&&<section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">{expenses.length} records</p><h2>Money Out</h2></div><strong className="panel-total">{peso(totals.moneyOut)}</strong></div><TransactionTable transactions={expenses} emptyMessage="Church expenses and vendor payments will be organized here." canEdit={canWriteFinance} onDetails={openTransactionDetails} onEdit={openTransactionEdit}/></section>}{["all","transfers"].includes(transactionFilter)&&<TransferHistory transfers={data.transfers}/>}</div></div>}
      {view === "offerings" &&
 activeChurch &&
 profile &&
 <OfferingsView

   churchId={activeChurch.id}

   userId={profile.id}

/>
}
{view === "donations" &&
 activeChurch &&
 profile &&
 <DonationsView

   churchId={activeChurch.id}

   userId={profile.id}

/>
}
{view === "expenses" &&
 activeChurch &&
 profile &&
 <ExpensesView

   churchId={activeChurch.id}

   userId={profile.id}

/>
}
      {view === "payables" && <section className="panel table-panel payables-panel"><div className="panel-head"><div><p className="eyebrow">{data.payables.filter(payable => payable.balance > 0).length} open items</p><h2>All payables</h2></div><strong className="panel-total">{peso(totals.payables)}</strong></div><div className="table-wrap responsive-table"><table><thead><tr><th>Due</th><th>Vendor / Payee</th><th>Category</th><th>Amount</th><th>Paid</th><th>Status</th><th className="num">Balance</th><th>Action</th></tr></thead><tbody>{data.payables.map(payable => <tr key={payable.id}><td data-label="Due">{dateLabel(payable.dueDate)}</td><td data-label="Vendor"><b>{payable.vendor}</b><small>{payable.payments.length} payment{payable.payments.length===1?"":"s"}</small></td><td data-label="Category">{payable.category}</td><td data-label="Amount">{peso(payable.amount)}</td><td data-label="Paid">{peso(payable.amountPaid)}</td><td data-label="Status"><span className={`status ${payable.status.toLowerCase().replaceAll(" ", "-")}`}>{payable.status}</span></td><td data-label="Balance" className="num">{peso(payable.balance)}</td><td data-label="Actions"><div className="row-actions"><button className="table-action" onClick={()=>openPayableDetails(payable)}>History</button><button className="table-action" disabled={!canWriteFinance || payable.balance <= 0} onClick={() => openPayablePayment(payable)}>{payable.balance > 0 ? "Record payment" : "Paid"}</button></div></td></tr>)}{!data.payables.length && <tr><td colSpan={8} className="blank-row"><EmptyState compact title="No payables yet" description="Add a commitment or bill to track its due date, payment history, and remaining balance."/></td></tr>}</tbody></table></div></section>}
      {view === "accounts" && <section className="account-cards">{data.accounts.map(account => <article className={`account-card ${account.active === "No" ? "inactive" : ""}`} key={account.id}><div className="account-card-head"><span>{account.type}</span><span className={`status ${account.active === "No" ? "unpaid" : "paid"}`}>{account.active === "No" ? "Inactive" : "Active"}</span></div><h3>{account.name}</h3><strong>{peso(account.currentBalance)}</strong><div className="account-breakdown"><small>Money in <b>{peso(account.moneyIn)}</b></small><small>Money out <b>{peso(account.moneyOut)}</b></small><small>Transfer net <b>{peso(account.transferIn-account.transferOut)}</b></small></div><button className="outline-button account-action" disabled={!canManageAccounts} onClick={() => openAccount(account)}>Manage account</button></article>)}{!data.accounts.length && !loading && <EmptyState title="Set up your first account" description="Create a cash or bank account to begin recording church income and expenses." action={canManageAccounts?<button className="primary-button" onClick={()=>openAccount(null)}><AppIcon name="plus" size={17}/>New Account</button>:undefined}/>}</section>}
      {view === "categories" &&
 activeChurch &&
 <CategoryManagementView
   churchId={activeChurch.id}
/>
}
{view === "payment-methods" &&
 activeChurch &&
 <PaymentMethodsView
   churchId={activeChurch.id}
/>
}
      {view === "projects" && activeChurch&&<ProjectsView churchId={activeChurch.id} canManage={hasChurchRole(activeRole,projectManagerRoles)}/>}
      {view === "reports" && <ReportsView data={data} />}
      {view === "members" &&
 isChurchAdmin &&
 profile &&
 activeChurch &&
 <MembersView

  churchId={activeChurch.id}

  userId={profile.id}

/>
}
      {view === "users" && isChurchAdmin&&profile&&activeChurch&&<UsersView churchId={activeChurch.id} currentUserId={profile.id} onAuthorizationChanged={refreshAuthorization}/>}
      {view === "audit" && isChurchAdmin&&activeChurch&&<AuditLogsView churchId={activeChurch.id}/>}
      {view === "backup" && isChurchAdmin&&churchProfile&&activeChurch&&<BackupCenterView churchId={activeChurch.id} profile={churchProfile}/>}
      {view === "system" && isChurchAdmin&&churchProfile&&activeChurch&&<SystemInformationView churchId={activeChurch.id} profile={churchProfile}/>}
      {view === "settings" &&
 churchProfile &&
 activeChurch &&
 <SettingsView
   profile={churchProfile}
   connected={connected}
   churchId={activeChurch.id}
 />
}

{view === "financial-approvals" &&
 activeChurch &&
 profile &&
 canApproveFinance &&
 <FinancialApprovalView
   churchId={activeChurch.id}
   userId={profile.id}
 />
}
      </PageTransition>
    </section>
    {modal === "transaction" && canWriteFinance && <Modal title={transactionType === "Income" ? "Record income" : transactionType === "Expense" ? "Record expense" : "Transfer between accounts"} onClose={closeModal}><TransactionForm data={data} initialType={transactionType} saving={saving} onSubmit={save} /></Modal>}
    {modal === "transaction-details" && selectedTransaction && <Modal eyebrow="Transaction record" title="Transaction details" onClose={closeModal}><TransactionDetails transaction={selectedTransaction} canEdit={canWriteFinance} onEdit={()=>openTransactionEdit(selectedTransaction)} /></Modal>}
    {modal === "transaction-edit" && canWriteFinance && selectedTransaction && <Modal eyebrow="Audit-tracked update" title="Edit transaction" onClose={closeModal}><TransactionForm data={data} initialType={selectedTransaction.type} transaction={selectedTransaction} saving={saving} onSubmit={save} /></Modal>}
    {modal === "payable" && canWriteFinance && <Modal title="Add payable" onClose={closeModal}><PayableForm data={data} saving={saving} onSubmit={save} /></Modal>}
    {modal === "payable-payment" && canWriteFinance && selectedPayable && <Modal eyebrow="Update payable" title={`Payment to ${selectedPayable.vendor}`} onClose={closeModal}><PayablePaymentForm payable={selectedPayable} saving={saving} onSubmit={save} /></Modal>}
    {modal === "payable-details" && selectedPayable && <Modal eyebrow="Payment ledger" title={`${selectedPayable.vendor} history`} onClose={closeModal}><PayableDetails payable={selectedPayable} canRecord={canWriteFinance} onRecord={()=>openPayablePayment(selectedPayable)} /></Modal>}
    {modal === "account" && canManageAccounts && <Modal eyebrow="Account management" title={selectedAccount ? "Edit account" : "Add account"} onClose={closeModal}><AccountForm account={selectedAccount} saving={saving} onSubmit={save} /></Modal>}
    {loading && <div className="loading-line" />}
  </main>;
}

function TransactionForm({ data, initialType, transaction, saving, onSubmit }: { data: Data; initialType: TransactionType; transaction?:Transaction; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
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

function TransactionDetails({transaction,canEdit,onEdit}:{transaction:Transaction;canEdit:boolean;onEdit:()=>void}){
  return <div><div className="detail-grid"><div><span>Date</span><b>{dateLabel(transaction.date)}</b></div><div><span>Type</span><b>{transaction.type}</b></div>{transaction.source==="expenses" &&
 transaction.approvalStatus &&

<div>
  <span>Approval Status</span>
  <b>
    {transaction.approvalStatus}
  </b>
</div>

}{transaction.source==="expenses" &&
 transaction.approvedAt &&

<div>
  <span>Approved Date</span>
  <b>
    {dateLabel(transaction.approvedAt)}
  </b>
</div>

}{transaction.source==="expenses" &&
 transaction.rejectionReason &&

<div className="detail-full">

  <span>
    Rejection Reason
  </span>

  <b>
    {transaction.rejectionReason}
  </b>

</div>

}<div><span>Amount</span><b>{peso(transaction.moneyIn||transaction.moneyOut)}</b></div><div><span>Account</span><b>{transaction.account}</b></div><div><span>Category</span><b>{transaction.category}</b></div><div><span>Payment method</span><b>{transaction.paymentMethod||"—"}</b></div>{transaction.vendor&&<div><span>Vendor / Payee</span><b>{transaction.vendor}</b></div>}<div><span>Reference</span><b>{transaction.reference||"—"}</b></div><div className="detail-full"><span>Description</span><b>{transaction.description||"—"}</b></div>{transaction.specifiedDetails&&<div className="detail-full"><span>Specified details</span><b>{transaction.specifiedDetails}</b></div>}<div className="detail-full"><span>Notes</span><b>{stripSpecifiedDetails(transaction.notes)||"—"}</b></div><div className="detail-full"><span>Record ID</span><code>{transaction.id}</code></div></div><div className="audit-note">Edits update this record in place. Its ID remains unchanged and the database audit log records old and new values.</div>{canEdit&&<button className="primary-button form-submit" onClick={onEdit}>Edit transaction</button>}</div>;
}

function PayableForm({ data, saving, onSubmit }: { data: Data; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const expenseCategories = data.categories.filter(category => category.type === "Expense" && category.active !== "No");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); const categoryId = String(form.get("categoryId") || ""); const category = data.categories.find(item => item.id === categoryId); if (!category) return; void onSubmit({ action: "addPayable", payable: { id: crypto.randomUUID(), vendor: String(form.get("vendor") || ""), dueDate: String(form.get("dueDate") || ""), category: category.name, categoryId, amount, amountPaid: 0, balance: amount, status: "Unpaid", notes: String(form.get("notes") || ""), createdAt: new Date().toISOString(), payments:[] } }); };
  return <form className="record-form" onSubmit={submit}><div className="form-grid"><label className="full">Vendor / Payee<input name="vendor" placeholder="Who needs to be paid?" required /></label><label>Due date<input name="dueDate" type="date" defaultValue={today} required /></label><label>Amount (PHP)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label className="full">Category<select name="categoryId" required>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="full">Notes<textarea name="notes" rows={3} /></label></div><button className="primary-button form-submit" disabled={saving || !expenseCategories.length}>{saving ? "Saving…" : "Save payable"}</button></form>;
}

function PayablePaymentForm({ payable, saving, onSubmit }: { payable: Payable; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({action:"recordPayablePayment",payment:{payableId:payable.id,paymentDate:String(form.get("paymentDate")||""),amount:Number(form.get("paymentAmount")),paymentMethod:String(form.get("paymentMethod")||""),reference:String(form.get("reference")||""),notes:String(form.get("notes")||"")}}); };
  return <form className="record-form" onSubmit={submit}><div className="payment-summary"><div><span>Original amount</span><b>{peso(payable.amount)}</b></div><div><span>Already paid</span><b>{peso(payable.amountPaid)}</b></div><div><span>Remaining balance</span><b>{peso(payable.balance)}</b></div></div><div className="form-grid"><label>Payment date<input name="paymentDate" type="date" defaultValue={today} max={today} required /></label><label>Payment amount (PHP)<input name="paymentAmount" type="number" min="0.01" max={payable.balance} step="0.01" defaultValue={payable.balance} required /></label><label>Payment method<select name="paymentMethod"><option>Cash</option><option>Bank Transfer</option><option>Check</option><option>Card</option><option>Online</option><option>Other</option></select></label><label>Reference<input name="reference" placeholder="Receipt or reference no." /></label><label className="full">Notes<textarea name="notes" rows={3} placeholder="Optional payment notes" /></label></div><p className="audit-note">Recorded payments are permanent history entries and cannot be edited or deleted from the app.</p><button className="primary-button form-submit" disabled={saving}>{saving?"Saving…":"Record payment"}</button></form>;
}

function PayableDetails({payable,canRecord,onRecord}:{payable:Payable;canRecord:boolean;onRecord:()=>void}){
  return <div><div className="payment-summary"><div><span>Original amount</span><b>{peso(payable.amount)}</b></div><div><span>Total paid</span><b>{peso(payable.amountPaid)}</b></div><div><span>Balance</span><b>{peso(payable.balance)}</b></div></div><div className="history-head"><div><p className="eyebrow">Immutable ledger</p><h3>Payment history</h3></div>{canRecord&&payable.balance>0&&<button className="secondary-button" onClick={onRecord}>＋ Record payment</button>}</div>{payable.payments.length?<div className="payment-history">{payable.payments.map(payment=><article key={payment.id}><div className="payment-history-mark">✓</div><div><b>{peso(payment.amount)}</b><span>{dateLabel(payment.paymentDate)} · {payment.paymentMethod}</span><small>{payment.reference?`Reference: ${payment.reference}`:"No reference"}</small>{payment.notes&&<small>{payment.notes}</small>}</div><div className="payment-user"><span>Recorded by</span><b>{payment.recordedByName||"Unknown user"}</b></div></article>)}</div>:<div className="empty-mini">No payments have been recorded for this payable.</div>}<p className="audit-note">Payment entries are append-only. Balance and status changes are recorded separately in the database audit log.</p></div>;
}

function AccountForm({ account, saving, onSubmit }: { account: Account | null; saving: boolean; onSubmit: (payload: CashFlowMutation) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({ action: "saveAccount", account: { id: account?.id, name: String(form.get("name") || ""), type: String(form.get("type") || "Cash") as "Cash" | "Bank" | "Other", openingBalance: Number(form.get("openingBalance")), active: String(form.get("active")) === "true" } }); };
  return <form className="record-form" onSubmit={submit}><div className="form-grid"><label className="full">Account name<input name="name" defaultValue={account?.name || ""} placeholder="Account name" required /></label><label>Account type<select name="type" defaultValue={account?.type || "Cash"}><option>Cash</option><option>Bank</option><option>Other</option></select></label><label>Opening balance (PHP)<input name="openingBalance" type="number" step="0.01" defaultValue={account?.openingBalance || 0} required /></label><label className="full">Status<select name="active" defaultValue={account?.active === "No" ? "false" : "true"}><option value="true">Active</option><option value="false">Inactive</option></select></label></div><p className="form-help">Deactivating an account keeps its transaction history while removing it from new entry forms.</p><button className="primary-button form-submit" disabled={saving}>{saving ? "Saving…" : account ? "Save account changes" : "Create account"}</button></form>;
}
