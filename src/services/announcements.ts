import { supabase } from "../lib/supabase";
import type { Announcement } from "../types";

export interface AnnouncementRecord extends Announcement {
  churchId: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  /** ISO timestamp with an explicit timezone; defaults to now on creation. */
  publishAt?: string;
  expiresAt?: string | null;
}
export type AnnouncementUpdate = Partial<AnnouncementInput>;

interface AnnouncementRow {
  id: string;
  church_id: string;
  title: string;
  content: string;
  publish_at: string;
  expires_at: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
type AnnouncementValues = Partial<Pick<AnnouncementRow, "title" | "content" | "publish_at" | "expires_at">>;
const announcementColumns = "id,church_id,title,content,publish_at,expires_at,is_published,created_by,created_at,updated_at";
const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};
const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

function timestamp(value: string, label: string): string {
  const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const date = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || match[1].startsWith("0000-") || !date || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== match[1] || Number(match[2]) > 23
    || Number(match[3]) > 59 || Number(match[4] || 0) > 59 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp with a timezone.`);
  }
  return new Date(value).toISOString();
}


function announcementValues(input: AnnouncementUpdate): AnnouncementValues {
  const values: AnnouncementValues = {};
  // General edits cannot change ownership, creation metadata, or publication state.
  if (input.title !== undefined) { requireId(input.title, "Announcement title"); values.title = input.title.trim(); }
  if (input.content !== undefined) { requireId(input.content, "Announcement content"); values.content = input.content.trim(); }
  if (input.publishAt !== undefined) values.publish_at = timestamp(input.publishAt, "Publish time");
  if (input.expiresAt !== undefined) values.expires_at = input.expiresAt === null ? null : timestamp(input.expiresAt, "Expiry time");
  if (values.publish_at && values.expires_at && Date.parse(values.expires_at) < Date.parse(values.publish_at)) {
    throw new Error("Expiry time must be on or after publish time.");
  }
  return values;
}

const mapAnnouncement = (row: AnnouncementRow): AnnouncementRecord => ({
  id: row.id, churchId: row.church_id, title: row.title, content: row.content,
  publishAt: row.publish_at, expiresAt: row.expires_at, isPublished: row.is_published,
  createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function loadAnnouncements(churchId: string): Promise<AnnouncementRecord[]> {
  const { data, error } = await client(churchId).from("announcements").select(announcementColumns)
    .eq("church_id", churchId).order("publish_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load announcements: ${error.message}`);
  return (data || []).map(mapAnnouncement);
}

/** New announcements are drafts; publishing is an explicit separate operation. */
export async function createAnnouncement(churchId: string, input: AnnouncementInput): Promise<AnnouncementRecord> {
  const db = client(churchId);
  requireId(input.title, "Announcement title");
  requireId(input.content, "Announcement content");
  const values = announcementValues({ ...input, publishAt: input.publishAt === undefined ? new Date().toISOString() : input.publishAt });
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired.");
  const { data, error } = await db.from("announcements").insert({ ...values, expires_at: values.expires_at ?? null,
    is_published: false, church_id: churchId, created_by: auth.user.id }).select(announcementColumns).single();
  if (error) throw new Error(`Unable to create announcement: ${error.message}`);
  return mapAnnouncement(data);
}

/** Omitted fields are preserved. The database atomically validates partially updated schedules. */
export async function updateAnnouncement(churchId: string, announcementId: string, input: AnnouncementUpdate): Promise<AnnouncementRecord> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const values = announcementValues(input);
  if (!Object.keys(values).length) throw new Error("Provide at least one announcement field to update.");
  const { data, error } = await db.from("announcements").update(values)
    .eq("church_id", churchId).eq("id", announcementId).select(announcementColumns).single();
  if (error) throw new Error(`Unable to update announcement: ${error.message}`);
  return mapAnnouncement(data);
}

export async function deleteAnnouncement(churchId: string, announcementId: string): Promise<void> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const { error } = await db.from("announcements").delete()
    .eq("church_id", churchId).eq("id", announcementId).select("id").single();
  if (error) throw new Error(`Unable to delete announcement: ${error.message}`);
}

/** Marks an announcement published while preserving its publish/expiry schedule. */
export async function publishAnnouncement(churchId: string, announcementId: string): Promise<AnnouncementRecord> {
  const db = client(churchId);
  requireId(announcementId, "Announcement");
  const { data, error } = await db.from("announcements").update({ is_published: true })
    .eq("church_id", churchId).eq("id", announcementId).select(announcementColumns).single();
  if (error) throw new Error(`Unable to publish announcement: ${error.message}`);
  return mapAnnouncement(data);
}

/** Active interval: publish_at <= at < expires_at; null expiry means no expiration. */
export async function getActiveAnnouncements(churchId: string, at = new Date().toISOString()): Promise<AnnouncementRecord[]> {
  const db = client(churchId);
  // Normalize before interpolation into PostgREST's OR expression.
  const instant = timestamp(at, "Active announcements reference time");
  const { data, error } = await db.from("announcements").select(announcementColumns)
    .eq("church_id", churchId).eq("is_published", true).lte("publish_at", instant)
    .or(`expires_at.is.null,expires_at.gt.${instant}`).order("publish_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load active announcements: ${error.message}`);
  return (data || []).map(mapAnnouncement);
}
