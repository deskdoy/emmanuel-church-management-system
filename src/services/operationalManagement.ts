import { supabase } from "../lib/supabase";
import type { BackupDataset, BackupExportMetadata, BackupExportScope, BackupExportType } from "../operations/backupExport";

export type ExportHistoryItem = {
  id: string;
  exportId: string;
  exportType: string;
  scope: string;
  recordCount: number;
  generatedAt: string;
  generatedBy: string;
};

export type SystemInformation = {
  connected: boolean;
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalProjects: number;
  totalAuditRecords: number;
  totalPayables: number;
  totalPayablePayments: number;
};

const client = () => { if (!supabase) throw new Error("Supabase is not configured."); return supabase; };
const relation = (value: unknown) => Array.isArray(value) ? value[0] : value;
const named = (value: unknown) => String((relation(value) as { name?: unknown } | null)?.name || "");
const person = (value: unknown) => {
  const user = relation(value) as { full_name?: unknown; email?: unknown } | null;
  return String(user?.full_name || user?.email || "Unknown user");
};
const isoRange = (scope: BackupExportScope) => ({ from: `${scope.dateFrom}T00:00:00.000Z`, to: `${scope.dateTo}T23:59:59.999Z` });

async function requireAdmin(churchId:string) {
  const db = client();
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError || !authData.user) throw new Error(authError?.message || "Your session has expired.");
  const { data, error } = await db.from("church_memberships").select("id,status,roles(name)").eq("church_id",churchId).eq("user_id", authData.user.id).single();
  if (error) throw new Error(`Unable to verify Admin access: ${error.message}`);
  if (data.status!=="active"||named(data.roles) !== "Admin") throw new Error("Only an active Church Admin can use operational management tools.");
  return authData.user;
}

async function allRows(churchId:string,table: string, select: string, orderColumn: string, scope: BackupExportScope, dateColumn: string) {
  const db = client();
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    let query = db.from(table).select(select).eq("church_id",churchId).order(orderColumn, { ascending: true }).range(start, start + pageSize - 1);
    if (!scope.allRecords) {
      const values = dateColumn === "created_at" ? isoRange(scope) : { from: scope.dateFrom, to: scope.dateTo };
      query = query.gte(dateColumn, values.from).lte(dateColumn, values.to);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Unable to export ${table}: ${error.message}`);
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const exportLabels: Record<BackupExportType, string> = {
  transactions: "All Transactions",
  "money-in": "Money In",
  "money-out": "Money Out",
  transfers: "Transfers",
  payables: "Payables",
  "payable-payments": "Payable Payments",
  users: "Users",
  projects: "Projects",
  "audit-logs": "Audit Logs",
};

async function incomeRows(churchId:string,scope: BackupExportScope) {
  const [offerings, donations] = await Promise.all([
    allRows(churchId,"offerings", "id,offering_date,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)", "offering_date", scope, "offering_date"),
    allRows(churchId,"donations", "id,donation_date,donor_name,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)", "donation_date", scope, "donation_date"),
  ]);
  return [
    ...offerings.map(row => ({ ...row, date: row.offering_date, source: "Offering", party: "" })),
    ...donations.map(row => ({ ...row, date: row.donation_date, source: "Donation", party: row.donor_name })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function expenseRows(churchId:string,scope: BackupExportScope) {
  const rows = await allRows(churchId,"expenses", "id,expense_date,vendor,description,amount,payment_method,reference,notes,created_at,accounts(name),categories(name)", "expense_date", scope, "expense_date");
  return rows.map(row => ({ ...row, date: row.expense_date, source: "Expense", party: row.vendor }));
}

const transactionHeaders = ["ID", "Date", "Type", "Source", "Account", "Category", "Party / Vendor", "Description", "Amount", "Payment Method", "Reference", "Notes", "Created At"];
const transactionRow = (row: Record<string, unknown>, type: string) => [row.id as string, row.date as string, type, row.source as string, named(row.accounts), named(row.categories), row.party as string, row.description as string, Number(row.amount), row.payment_method as string, row.reference as string, row.notes as string, row.created_at as string];

export async function loadBackupDataset(churchId:string,type: BackupExportType, scope: BackupExportScope): Promise<BackupDataset> {
  await requireAdmin(churchId);
  if (!scope.allRecords && (!scope.dateFrom || !scope.dateTo || scope.dateFrom > scope.dateTo)) throw new Error("Choose a valid export date range.");
  if (type === "money-in") {
    const rows = await incomeRows(churchId,scope);
    return { type, title: exportLabels[type], headers: transactionHeaders, rows: rows.map(row => transactionRow(row, "Money In")) };
  }
  if (type === "money-out") {
    const rows = await expenseRows(churchId,scope);
    return { type, title: exportLabels[type], headers: transactionHeaders, rows: rows.map(row => transactionRow(row, "Money Out")) };
  }
  if (type === "transactions") {
    const [income, expenses] = await Promise.all([incomeRows(churchId,scope), expenseRows(churchId,scope)]);
    const rows = [...income.map(row => transactionRow(row, "Money In")), ...expenses.map(row => transactionRow(row, "Money Out"))]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    return { type, title: exportLabels[type], headers: transactionHeaders, rows };
  }
  if (type === "transfers") {
    const rows = await allRows(churchId,"account_transfers", "id,transfer_date,amount,reference,notes,created_at,from_account:accounts!account_transfers_from_account_id_fkey(name),to_account:accounts!account_transfers_to_account_id_fkey(name),recorder:users!account_transfers_recorded_by_fkey(full_name,email)", "transfer_date", scope, "transfer_date");
    return { type, title: exportLabels[type], headers: ["ID", "Date", "From Account", "To Account", "Amount", "Reference", "Notes", "Recorded By", "Created At"], rows: rows.map(row => [row.id as string, row.transfer_date as string, named(row.from_account), named(row.to_account), Number(row.amount), row.reference as string, row.notes as string, person(row.recorder), row.created_at as string]) };
  }
  if (type === "payables") {
    const rows = await allRows(churchId,"payables", "id,vendor,due_date,amount,amount_paid,status,notes,created_at,categories(name)", "due_date", scope, "due_date");
    return { type, title: exportLabels[type], headers: ["ID", "Vendor", "Due Date", "Category", "Amount", "Paid", "Remaining", "Status", "Notes", "Created At"], rows: rows.map(row => [row.id as string, row.vendor as string, row.due_date as string, named(row.categories), Number(row.amount), Number(row.amount_paid), Number(row.amount) - Number(row.amount_paid), row.status as string, row.notes as string, row.created_at as string]) };
  }
  if (type === "payable-payments") {
    const rows = await allRows(churchId,"payable_payments", "id,payable_id,payment_date,amount,payment_method,reference,notes,recorded_by_name,created_at,payables(vendor)", "payment_date", scope, "payment_date");
    return { type, title: exportLabels[type], headers: ["ID", "Payable ID", "Vendor", "Payment Date", "Amount", "Method", "Reference", "Notes", "Recorded By", "Created At"], rows: rows.map(row => [row.id as string, row.payable_id as string, named(row.payables), row.payment_date as string, Number(row.amount), row.payment_method as string, row.reference as string, row.notes as string, row.recorded_by_name as string, row.created_at as string]) };
  }
  if (type === "users") {
    let query=client().from("church_memberships").select("id,user_id,status,created_at,roles(name),users(id,full_name,email,is_active,created_at)").eq("church_id",churchId).order("created_at");
    if(!scope.allRecords){const range=isoRange(scope);query=query.gte("created_at",range.from).lte("created_at",range.to);}
    const {data,error}=await query;if(error)throw new Error(`Unable to export users: ${error.message}`);
    return { type, title: exportLabels[type], headers: ["ID", "Name", "Email", "Role", "Status", "Created At"], rows: (data||[]).flatMap(row=>{const user=relation(row.users) as {id?:unknown;full_name?:unknown;email?:unknown;is_active?:unknown;created_at?:unknown}|null;return user?[[String(user.id||row.user_id),String(user.full_name||""),String(user.email||""),named(row.roles),row.status==="active"&&user.is_active?"Active":"Inactive",String(row.created_at)]]:[];}) };
  }
  if (type === "projects") {
    const rows = await allRows(churchId,"projects", "id,name,description,budget,start_date,end_date,status,created_at", "created_at", scope, "created_at");
    return { type, title: exportLabels[type], headers: ["ID", "Name", "Description", "Budget", "Start Date", "Target Date", "Status", "Created At"], rows: rows.map(row => [row.id as string, row.name as string, row.description as string, Number(row.budget), row.start_date as string, row.end_date as string, row.status as string, row.created_at as string]) };
  }
  const rows = await allRows(churchId,"audit_logs", "id,actor_user_id,action,table_name,record_id,old_values,new_values,created_at,users(full_name,email)", "created_at", scope, "created_at");
  return { type, title: exportLabels[type], headers: ["ID", "Timestamp", "User", "Action", "Module", "Record ID", "Before Values", "After Values"], rows: rows.map(row => [Number(row.id), row.created_at as string, person(row.users), row.action as string, row.table_name as string, row.record_id as string, row.old_values ? JSON.stringify(row.old_values) : "", row.new_values ? JSON.stringify(row.new_values) : ""]) };
}

export async function recordExportActivity(churchId:string,dataset: BackupDataset, metadata: BackupExportMetadata, scope: BackupExportScope) {
  const user = await requireAdmin(churchId);
  const { error } = await client().from("reports").insert({
    church_id:churchId,
    title: `Backup export: ${dataset.title}`,
    report_type: "backup_export",
    date_from: scope.allRecords ? null : scope.dateFrom,
    date_to: scope.allRecords ? null : scope.dateTo,
    parameters: { export_id: metadata.exportId, export_type: dataset.type, export_label: dataset.title, export_scope: metadata.scopeLabel, generated_at: metadata.generatedAt, record_count: dataset.rows.length, format: "CSV / printable summary" },
    generated_data: { record_count: dataset.rows.length },
    generated_by: user.id,
  });
  if (error) throw new Error(`The export could not be audited: ${error.message}`);
}

export async function loadExportHistory(churchId:string,limit = 50): Promise<ExportHistoryItem[]> {
  await requireAdmin(churchId);
  const { data, error } = await client().from("reports").select("id,parameters,created_at,users(full_name,email)").eq("church_id",churchId).eq("report_type", "backup_export").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Unable to load export history: ${error.message}`);
  return (data || []).map(row => {
    const parameters = (row.parameters || {}) as Record<string, unknown>;
    return { id: row.id, exportId: String(parameters.export_id || row.id), exportType: String(parameters.export_label || parameters.export_type || "Export"), scope: String(parameters.export_scope || "All available records"), recordCount: Number(parameters.record_count) || 0, generatedAt: row.created_at, generatedBy: person(row.users) };
  });
}

async function exactCount(churchId:string,table: string, filter?: { column: string; value: boolean|string }) {
  let query = client().from(table).select("*", { count: "exact", head: true }).eq("church_id",churchId);
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

export async function loadSystemInformation(churchId:string): Promise<SystemInformation> {
  await requireAdmin(churchId);
  const [totalUsers, activeUsers, offerings, donations, expenses, transfers, totalProjects, totalAuditRecords, totalPayables, totalPayablePayments] = await Promise.all([
    exactCount(churchId,"church_memberships"), exactCount(churchId,"church_memberships", { column: "status", value: "active" }), exactCount(churchId,"offerings"), exactCount(churchId,"donations"), exactCount(churchId,"expenses"), exactCount(churchId,"account_transfers"), exactCount(churchId,"projects"), exactCount(churchId,"audit_logs"), exactCount(churchId,"payables"), exactCount(churchId,"payable_payments"),
  ]);
  return { connected: true, totalUsers, activeUsers, totalTransactions: offerings + donations + expenses + transfers, totalProjects, totalAuditRecords, totalPayables, totalPayablePayments };
}
