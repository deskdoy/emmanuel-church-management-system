import type { RoleName } from "../../types";
export const announcementManagerRoles: readonly RoleName[] = ["Admin", "Pastor", "Secretary"];
const pad = (value: number) => String(value).padStart(2, "0");
export const displayAnnouncementTime = (value: string) => new Date(value).toLocaleString();
export function announcementTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}
export function announcementTimeToISO(value: string, original?: string | null): string {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value) || value.startsWith("0000-")
    || !Number.isFinite(date.getTime()) || announcementTimeInput(date.toISOString()).slice(0, 16) !== value.slice(0, 16)) {
    throw new Error("Enter a valid local date and time.");
  }
  // Preserve an unchanged instant even during a repeated daylight-saving hour.
  if (original && date.getTime() === new Date(announcementTimeInput(original)).getTime()) return new Date(original).toISOString();
  return date.toISOString();
}
