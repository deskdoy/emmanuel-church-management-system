"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../src/auth/AuthContext";
import { useActiveChurch } from "../src/tenancy/ActiveChurchContext";
import { accountManagerRoles, financeWriterRoles, hasChurchRole, projectManagerRoles } from "../src/tenancy/permissions";
import { AuditLogsView } from "../src/components/AuditLogsView";
import { BackupCenterView } from "../src/components/BackupCenterView";
import { BudgetView } from "../src/components/budgets/BudgetView";
import { DashboardView } from "../src/components/DashboardView";
import { ProjectsView } from "../src/components/ProjectsView";
import { ReportsView } from "../src/components/ReportsView";
import { SettingsView } from "../src/components/SettingsView";
import { FinancialApprovalView } from "../src/components/FinancialApprovalView";
import { SystemInformationView } from "../src/components/SystemInformationView";
import { FamilyView } from "../src/components/families/FamilyView";
import { AttendanceView } from "../src/components/attendance/AttendanceView";
import { MembersView } from "../src/components/MembersView";
import { CategoryManagementView } from "../src/components/CategoryManagementView";
import { PaymentMethodsView } from "../src/components/PaymentMethodsView";
import { OfferingsView } from "../src/components/OfferingsView";
import { DonationsView } from "../src/components/DonationsView";
import { ExpensesView } from "../src/components/ExpensesView";
import { UsersView } from "../src/components/UsersView";
import { PlatformAdministrationView } from "../src/components/PlatformAdministrationView";
import { TransactionForm, type TransactionType } from "../src/components/transactions/TransactionForm";
import { TransactionDetails } from "../src/components/transactions/TransactionDetails";
import { PayableForm } from "../src/components/transactions/PayableForm";
import { PayablePaymentForm } from "../src/components/transactions/PayablePaymentForm";
import { PayableDetails } from "../src/components/transactions/PayableDetails";
import { AccountForm } from "../src/components/transactions/AccountForm";
import { dateLabel, peso } from "../src/components/transactions/formatters";
import { Sidebar } from "../src/components/layout/Sidebar";
import { Topbar } from "../src/components/layout/Topbar";
import { getNavigationItems, getViewHeadings, type View } from "../src/navigation/viewRegistry";
import { AppIcon } from "../src/components/ui/AppIcon";
import { EmptyState } from "../src/components/ui/EmptyState";
import { PageTransition } from "../src/components/ui/PageTransition";
import { addPayable, addTransaction, addTransfer, createAccount, loadCashFlow, recordPayablePayment, updateAccount, updateTransaction } from "../src/services/cashflow";
import type { Account, AccountTransfer, CashFlowData as Data, CashFlowMutation, Payable, Transaction } from "../src/types";

type TransactionFilter = "all" | "income" | "expenses" | "transfers";
type ModalName = "transaction" | "transaction-details" | "transaction-edit" | "payable" | "payable-payment" | "payable-details" | "account" | null;

const emptyData: Data = { transactions: [], transfers: [], payables: [], accounts: [], categories: [] };

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
  const [transactionFilter,setTransactionFilter]=useState<TransactionFilter>("all");

  const canWriteFinance=hasChurchRole(activeRole,financeWriterRoles);
  const canManageAccounts=hasChurchRole(activeRole,accountManagerRoles);
  const isChurchAdmin=activeRole==="Admin";
  const canApproveFinance =
  activeRole==="Admin" ||
  activeRole==="Treasurer";
  const churchProfile=profile&&activeRole?{...profile,role:activeRole}:null;
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    if(!activeChurch){setData(emptyData);setConnected(false);setLoading(false);return;}
    try { setData(await loadCashFlow(activeChurch.id)); setConnected(true); }
    catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Unable to load financial data."); }
    finally { setLoading(false); }
  }, [activeChurch]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);


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
  const headings = getViewHeadings(profile);
  const navItems = getNavigationItems({ isChurchAdmin, canApproveFinance });
  const showFinanceNotice = !canWriteFinance && ["transactions", "payables"].includes(view);
  const headerActions = () => {
    if (["dashboard", "transactions"].includes(view)) return <button className="primary-button" disabled={!canWriteFinance} onClick={() => openTransaction("Income")}><AppIcon name="plus" size={17}/>New Transaction</button>;
    if (view === "payables") return <button className="primary-button" disabled={!canWriteFinance} onClick={() => setModal("payable")}><AppIcon name="plus" size={17}/>Add Payable</button>;
    if (view === "accounts") return <button className="primary-button" disabled={!canManageAccounts} onClick={() => openAccount(null)}><AppIcon name="plus" size={17}/>New Account</button>;
    return null;
  };

  return <main className="app-shell">
    <Sidebar
      view={view}
      navItems={navItems}
      onNavigate={setView}
      profile={profile}
      activeRole={activeRole}
      connected={connected}
      onSignOut={signOut}
    />
    <section className="workspace">
      <Topbar heading={headings[view]} profile={profile} activeRole={activeRole} actions={headerActions()}/>
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
      {view === "budgets" && activeChurch && <BudgetView churchId={activeChurch.id} />}
      {view === "projects" && activeChurch&&<ProjectsView churchId={activeChurch.id} canManage={hasChurchRole(activeRole,projectManagerRoles)}/>}
      {view === "reports" && <ReportsView data={data} />}
      {view === "families" && activeChurch && <FamilyView churchId={activeChurch.id} />}
      {view === "attendance" && activeChurch && <AttendanceView churchId={activeChurch.id} />}
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
