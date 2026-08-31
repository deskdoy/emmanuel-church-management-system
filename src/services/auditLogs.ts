import { supabase } from "../lib/supabase";
import type { AppUser, AuditLog, DashboardAuditEvent } from "../types";

export type AuditLogFilters = {
  dateFrom: string;
  dateTo: string;
  userId: string;
  action: "" | AuditLog["action"];
  module: string;
};

export const auditModules = [
  "access_requests", "account_transfers", "accounts", "announcements", "attendance", "categories", "donations", "events",
  "expenses", "members", "offerings", "payable_payments", "payables", "projects",
  "reports", "church_memberships", "users",
] as const;

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const relationUser = (value: unknown) => {
  const user = Array.isArray(value) ? value[0] : value;
  return (user || {}) as { full_name?: unknown; email?: unknown };
};

export async function loadAuditUsers(churchId:string): Promise<Pick<AppUser, "id" | "fullName" | "email">[]> {
  const { data, error } = await client().from("church_memberships").select("user_id,users(id,full_name,email)").eq("church_id",churchId).order("created_at");
  if (error) throw new Error(`Unable to load audit users: ${error.message}`);
  return (data || []).flatMap(row=>{const user=Array.isArray(row.users)?row.users[0]:row.users;return user?[{id:user.id,fullName:user.full_name||"",email:user.email}]:[];});
}

export async function loadAuditLogs(churchId:string,filters: AuditLogFilters): Promise<AuditLog[]> {
  const rangeStart = new Date(`${filters.dateFrom}T00:00:00.000`).toISOString();
  const rangeEnd = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  let query = client().from("audit_logs")
    .select("id,actor_user_id,action,table_name,record_id,old_values,new_values,created_at,users(full_name,email)")
    .eq("church_id",churchId)
    .gte("created_at", rangeStart)
    .lte("created_at", rangeEnd)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.userId) query = query.eq("actor_user_id", filters.userId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.module) query = query.eq("table_name", filters.module);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load audit logs: ${error.message}`);
  return (data || []).map(row => {
    const actor = relationUser(row.users);
    return {
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: String(actor.full_name || ""),
      actorEmail: String(actor.email || ""),
      action: row.action as AuditLog["action"],
      tableName: row.table_name,
      recordId: row.record_id,
      oldValues: row.old_values as Record<string, unknown> | null,
      newValues: row.new_values as Record<string, unknown> | null,
      createdAt: row.created_at,
    };
  });
}

export async function loadDashboardAuditActivity(churchId:string,limit=30):Promise<DashboardAuditEvent[]> {
  const {data,error}=await client().from("audit_logs")
    .select("id,actor_user_id,action,table_name,record_id,created_at,users(full_name,email)")
    .eq("church_id",churchId)
    .in("table_name",["offerings","donations","expenses","payable_payments","account_transfers","church_memberships","users","access_requests"])
    .order("created_at",{ascending:false})
    .limit(limit);
  if(error)throw new Error(`Unable to load recent audit activity: ${error.message}`);
  return(data||[]).map(row=>{const actor=relationUser(row.users);return{id:row.id,actorName:String(actor.full_name||actor.email||"Administrator"),action:row.action as DashboardAuditEvent["action"],tableName:row.table_name,recordId:row.record_id,createdAt:row.created_at};});
}
