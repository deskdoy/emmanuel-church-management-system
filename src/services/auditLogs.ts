import { supabase } from "../lib/supabase";
import type { AppUser, AuditLog } from "../types";

export type AuditLogFilters = {
  dateFrom: string;
  dateTo: string;
  userId: string;
  action: "" | AuditLog["action"];
  module: string;
};

export const auditModules = [
  "accounts", "announcements", "attendance", "categories", "donations", "events",
  "expenses", "members", "offerings", "payable_payments", "payables", "projects",
  "reports", "users",
] as const;

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const relationUser = (value: unknown) => {
  const user = Array.isArray(value) ? value[0] : value;
  return (user || {}) as { full_name?: unknown; email?: unknown };
};

export async function loadAuditUsers(): Promise<Pick<AppUser, "id" | "fullName" | "email">[]> {
  const { data, error } = await client().from("users").select("id,full_name,email").order("full_name");
  if (error) throw new Error(`Unable to load audit users: ${error.message}`);
  return (data || []).map(user => ({ id: user.id, fullName: user.full_name || "", email: user.email }));
}

export async function loadAuditLogs(filters: AuditLogFilters): Promise<AuditLog[]> {
  const rangeStart = new Date(`${filters.dateFrom}T00:00:00.000`).toISOString();
  const rangeEnd = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  let query = client().from("audit_logs")
    .select("id,actor_user_id,action,table_name,record_id,old_values,new_values,created_at,users(full_name,email)")
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
