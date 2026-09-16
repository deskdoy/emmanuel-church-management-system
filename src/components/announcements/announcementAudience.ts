import { getSupabase } from "../../lib/supabase";
import { addAnnouncementTarget, loadAnnouncementTargets, removeAnnouncementTarget, type AnnouncementTargetInput, type AnnouncementTargetType } from "../../services/announcementTargets";

export interface AudienceOption { id: string; label: string }
export type AudienceOptions = Record<Exclude<AnnouncementTargetType, "All">, AudienceOption[]>;
export const audienceKey = (target: { targetType: string; targetId?: string | null }) => `${target.targetType}:${target.targetId ?? ""}`;

/** Minimal directory fields for selection. All tenant directories are scoped;
 * roles are the shared role catalog, with access still controlled by its RLS. */
export async function loadAudienceOptions(churchId: string): Promise<AudienceOptions> {
  if (!churchId.trim()) throw new Error("Church workspace is required.");
  const db = getSupabase();
  async function load(kind: Exclude<AnnouncementTargetType, "All">): Promise<AudienceOption[]> {
    const options: AudienceOption[] = [];
    let offset = 0;
    while (true) {
      const table = { Member: "members", Family: "families", Event: "events", Role: "roles" }[kind];
      const columns = kind === "Member" ? "id,church_id,first_name,middle_name,last_name" : kind === "Role" ? "id,name" : kind === "Event" ? "id,church_id,title,starts_at" : "id,church_id,name";
      let query = db.from(table).select(columns, { count: "exact" });
      if (kind !== "Role") query = query.eq("church_id", churchId);
      const { data, count, error } = await query.order("id").range(offset, offset + 999);
      if (error) throw new Error(`Unable to load ${kind.toLowerCase()} choices: ${error.message}`);
      if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error("Unable to load audience choices completely.");
      const rows = (data || []) as unknown as { id: string; church_id?: string; first_name?: string; middle_name?: string; last_name?: string; name?: string; title?: string; starts_at?: string }[];
      for (const row of rows) {
        if (kind !== "Role" && row.church_id !== churchId) continue;
        options.push({ id: row.id, label: kind === "Member" ? [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ")
          : kind === "Event" ? `${row.title} (${new Date(row.starts_at!).toLocaleDateString()})` : row.name || "Unnamed" });
      }
      offset += rows.length;
      if (offset >= count) return options.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
      if (!rows.length) throw new Error("Unable to load audience choices completely.");
    }
  }
  const [Member, Family, Event, Role] = await Promise.all([load("Member"), load("Family"), load("Event"), load("Role")]);
  return { Member, Family, Event, Role };
}

/** Re-read on every retry so partially completed saves do not add duplicates.
 * Preserve matches, add new targets, then remove deselected targets. Separate
 * requests are not atomic; callers must keep the form open on failure. */
export async function saveAudienceTargets(churchId: string, announcementId: string, desired: AnnouncementTargetInput[], isCurrent: () => boolean): Promise<void> {
  const checkScope = () => { if (!isCurrent()) throw new Error("Church workspace changed."); };
  checkScope();
  const existing = await loadAnnouncementTargets(churchId, announcementId);
  const desiredKeys = new Set(desired.map(audienceKey));
  const existingKeys = new Set(existing.map(audienceKey));
  for (const target of desired) {
    checkScope();
    const key = audienceKey(target);
    if (!existingKeys.has(key)) { await addAnnouncementTarget(churchId, announcementId, target); existingKeys.add(key); }
  }
  for (const target of existing) {
    checkScope();
    if (!desiredKeys.has(audienceKey(target))) await removeAnnouncementTarget(churchId, target.id);
  }
  checkScope();
}
