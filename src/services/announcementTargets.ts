import { supabase } from "../lib/supabase";

export type AnnouncementTargetType = "All" | "Member" | "Family" | "Event" | "Role";
export type AnnouncementTargetInput =
  | { targetType: "All"; targetId?: null }
  | { targetType: Exclude<AnnouncementTargetType, "All">; targetId: string };
export interface AnnouncementTarget {
  id: string;
  churchId: string;
  announcementId: string;
  targetType: AnnouncementTargetType;
  targetId: string | null;
  createdAt: string;
}
/** Profile IDs and user IDs are separate identities; no email-based linking. */
export interface AnnouncementRecipient {
  kind: "member" | "user";
  id: string;
  churchId: string;
  displayName: string;
}
export interface AnnouncementAudience {
  churchId: string;
  announcementId: string;
  targets: AnnouncementTarget[];
  recipients: AnnouncementRecipient[];
}
interface TargetRow {
  id: string; church_id: string; announcement_id: string;
  target_type: AnnouncementTargetType; target_id: string | null; created_at: string;
}
interface MemberRow {
  id: string; church_id: string; first_name: string; middle_name: string; last_name: string;
  membership_status: string;
}
interface MembershipRow {
  id: string; church_id: string; user_id: string; status: string;
  users: { id: string; full_name: string; is_active: boolean } | { id: string; full_name: string; is_active: boolean }[] | null;
}
interface EventAttendanceRow {
  id: string; church_id: string;
  members: MemberRow | MemberRow[] | null;
}
type QueryResult<T> = { data: T[] | null; count: number | null; error: { message: string } | null };
const targetColumns = "id,church_id,announcement_id,target_type,target_id,created_at";
const memberColumns = "id,church_id,first_name,middle_name,last_name,membership_status";
const targetTypes: readonly AnnouncementTargetType[] = ["All", "Member", "Family", "Event", "Role"];
const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};
const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
function targetValues(input: AnnouncementTargetInput) {
  if (!input || !targetTypes.includes(input.targetType)) throw new Error("Choose a valid announcement target type.");
  if (input.targetType === "All") {
    if (input.targetId != null) throw new Error("All targets must not have a target ID.");
    return { target_type: input.targetType, target_id: null };
  }
  requireId(input.targetId, "Target");
  return { target_type: input.targetType, target_id: input.targetId };
}
const mapTarget = (row: TargetRow): AnnouncementTarget => ({
  id: row.id, churchId: row.church_id, announcementId: row.announcement_id,
  targetType: row.target_type, targetId: row.target_id, createdAt: row.created_at,
});
const relation = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const memberRecipient = (row: MemberRow): AnnouncementRecipient => ({
  kind: "member", id: row.id, churchId: row.church_id,
  displayName: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
});
function uniqueRecipients(rows: AnnouncementRecipient[]): AnnouncementRecipient[] {
  return [...new Map(rows.map(row => [`${row.kind}:${row.id}`, row])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

// Exact counts and stable ordering avoid silently truncating recipients at the
// API page limit. All pages use the caller's normal session and tenant filters.
async function pages<T>(query: (offset: number) => PromiseLike<QueryResult<T>>, label: string): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, count, error } = await query(rows.length);
    if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
    if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error(`Unable to load ${label}: exact count unavailable.`);
    const page = data || [];
    rows.push(...page);
    if (rows.length >= count) return rows;
    if (!page.length) throw new Error(`Unable to load ${label}: incomplete results.`);
  }
}

export async function loadAnnouncementTargets(churchId: string, announcementId: string): Promise<AnnouncementTarget[]> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const rows = await pages<TargetRow>(offset => db.from("announcement_targets").select(targetColumns, { count: "exact" })
    .eq("church_id", churchId).eq("announcement_id", announcementId).order("id").range(offset, offset + 999), "announcement targets");
  return rows.filter(row => row.church_id === churchId && row.announcement_id === announcementId).map(mapTarget);
}

export async function addAnnouncementTarget(churchId: string, announcementId: string, input: AnnouncementTargetInput): Promise<AnnouncementTarget> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const values = targetValues(input);
  // Explicit insert: RLS authorizes managers and DB constraints/trigger validate
  // same-church references and duplicates. Never upsert or write caller metadata.
  const { data, error } = await db.from("announcement_targets")
    .insert({ church_id: churchId, announcement_id: announcementId, ...values }).select(targetColumns).single();
  if (error) throw new Error(`Unable to add announcement target: ${error.message}`);
  return mapTarget(data);
}

export async function removeAnnouncementTarget(churchId: string, targetId: string): Promise<void> {
  const db = client(churchId);
  requireId(targetId, "Announcement target");
  const { error } = await db.from("announcement_targets").delete()
    .eq("church_id", churchId).eq("id", targetId).select("id").single();
  if (error) throw new Error(`Unable to remove announcement target: ${error.message}`);
}

/**
 * RLS-visible recipient preview, not a delivery list or authorization decision.
 * All: active profiles + active church user accounts; Member/Family: active
 * profiles; Event: active profiles recorded Present/Late; Role: active church
 * memberships with that role UUID and active user accounts. Membership/user RLS
 * may restrict account visibility. No privileged fallback or inferred identities.
 * Missing/deleted targets resolve to nobody. Reads are not a database snapshot.
 */
export async function getTargetRecipients(churchId: string, input: AnnouncementTargetInput): Promise<AnnouncementRecipient[]> {
  const db = client(churchId);
  const target = targetValues(input);
  if (target.target_type === "Family" || target.target_type === "Event") {
    const { data, error } = await db.from(target.target_type === "Family" ? "families" : "events").select("id")
      .eq("church_id", churchId).eq("id", target.target_id!).maybeSingle();
    if (error) throw new Error(`Unable to resolve announcement target: ${error.message}`);
    if (!data) return [];
  }
  const members = async (): Promise<AnnouncementRecipient[]> => {
    if (target.target_type === "Event") {
      const rows = await pages<EventAttendanceRow>(offset => db.from("attendance")
        .select(`id,church_id,members!attendance_member_id_fkey!inner(${memberColumns})`, { count: "exact" })
        .eq("church_id", churchId).eq("event_id", target.target_id!).in("status", ["Present", "Late"])
        .eq("members.church_id", churchId).eq("members.membership_status", "Active")
        .order("id").range(offset, offset + 999), "event recipients");
      return rows.flatMap(row => {
        const member = relation(row.members);
        return row.church_id === churchId && member?.church_id === churchId && member.membership_status === "Active" ? [memberRecipient(member)] : [];
      });
    }
    const rows = await pages<MemberRow>(offset => {
      let query = db.from("members").select(memberColumns, { count: "exact" }).eq("church_id", churchId).eq("membership_status", "Active");
      if (target.target_type === "Member") query = query.eq("id", target.target_id!);
      if (target.target_type === "Family") query = query.eq("family_id", target.target_id!);
      return query.order("id").range(offset, offset + 999);
    }, "member recipients");
    return rows.filter(row => row.church_id === churchId && row.membership_status === "Active").map(memberRecipient);
  };
  const users = async (): Promise<AnnouncementRecipient[]> => {
    const rows = await pages<MembershipRow>(offset => {
      let query = db.from("church_memberships").select("id,church_id,user_id,status,users!church_memberships_user_id_fkey!inner(id,full_name,is_active)", { count: "exact" })
        .eq("church_id", churchId).eq("status", "active").eq("users.is_active", true);
      if (target.target_type === "Role") query = query.eq("role_id", target.target_id!);
      return query.order("id").range(offset, offset + 999);
    }, "role recipients");
    return rows.flatMap(row => {
      const user = relation(row.users);
      return row.church_id === churchId && row.status === "active" && user?.is_active && user.id === row.user_id
        ? [{ kind: "user" as const, id: user.id, churchId, displayName: user.full_name }] : [];
    });
  };
  if (target.target_type === "All") {
    const groups = await Promise.all([members(), users()]);
    return uniqueRecipients(groups.flat());
  }
  return uniqueRecipients(await (target.target_type === "Role" ? users() : members()));
}

/** Union of configured targets; no targets means no recipients, never All. */
export async function getAnnouncementAudience(churchId: string, announcementId: string): Promise<AnnouncementAudience> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const { error } = await db.from("announcements").select("id").eq("church_id", churchId).eq("id", announcementId).single();
  if (error) throw new Error(`Unable to load announcement audience: ${error.message}`);
  const targets = await loadAnnouncementTargets(churchId, announcementId);
  // Validate stored types before resolving anything; unknown values must fail closed.
  const inputs = targets.map(target => {
    const input = { targetType: target.targetType, targetId: target.targetId } as AnnouncementTargetInput;
    targetValues(input);
    return input;
  });
  const groups = await Promise.all(inputs.map(input => getTargetRecipients(churchId, input)));
  return { churchId, announcementId, targets, recipients: uniqueRecipients(groups.flat()) };
}
