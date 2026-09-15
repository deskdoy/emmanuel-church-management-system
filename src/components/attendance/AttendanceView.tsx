import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { loadFamilies } from "../../services/families";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { AttendanceSessionForm } from "./AttendanceSessionForm";
import { AttendanceRegister } from "./AttendanceRegister";
import { AttendanceHistory } from "./AttendanceHistory";
import { AttendanceReports } from "./AttendanceReports";
import type { AttendanceDirectory, AttendanceSession } from "./types";
import "./attendance.css";

export function AttendanceView({ churchId }: { churchId: string }) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open attendance from your active church workspace." /></section>;
  }
  return <AttendanceWorkspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} />;
}

function AttendanceWorkspace({ churchId }: { churchId: string }) {
  const [directory, setDirectory] = useState<AttendanceDirectory | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [section, setSection] = useState<"register" | "history" | "reports">("register");
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDirectory(null); setError("");
    const load = async () => {
      const db = getSupabase();
      const [members, events, families] = await Promise.all([
        db.from("members").select("id,church_id,first_name,middle_name,last_name,member_number,family_id").eq("church_id", churchId).order("last_name").order("first_name"),
        db.from("events").select("id,church_id,title,starts_at").eq("church_id", churchId).order("starts_at", { ascending: false }),
        loadFamilies(churchId),
      ]);
      if (members.error) throw new Error(`Unable to load members: ${members.error.message}`);
      if (events.error) throw new Error(`Unable to load events: ${events.error.message}`);
      if (!cancelled) setDirectory({ churchId,
        members: (members.data || []).filter(row => row.church_id === churchId).map(row => ({ id: row.id, churchId: row.church_id, name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "), memberNumber: row.member_number, familyId: row.family_id })),
        events: (events.data || []).filter(row => row.church_id === churchId).map(row => ({ id: row.id, churchId: row.church_id, title: row.title, startsAt: row.starts_at })),
        families: families.filter(row => row.churchId === churchId),
      });
    };
    void load().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load attendance data."); });
    return () => { cancelled = true; };
  }, [churchId, reload]);

  return <section className="attendance-workspace" aria-label="Attendance">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">Church community</p><h2>Attendance</h2><p className="section-copy">Record attendance and review member and family participation.</p></div></div>
      <div className="row-actions attendance-actions">
        <button className="outline-button" aria-pressed={section === "register"} disabled={saving} onClick={() => setSection("register")}>Attendance register</button>
        <button className="outline-button" aria-pressed={section === "history"} disabled={saving} onClick={() => setSection("history")}>Attendance history</button>
        <button className="outline-button" aria-pressed={section === "reports"} disabled={saving} onClick={() => setSection("reports")}>Attendance reports</button>
      </div>
    </section>
    {error ? <div className="error-banner" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : !directory ? <section className="panel"><LoadingSkeleton rows={4} label="Loading attendance data" /></section>
      : section === "reports" ? <AttendanceReports churchId={churchId} directory={directory} />
      : section === "history" ? <AttendanceHistory churchId={churchId} directory={directory} />
      : session ? <><div className="row-actions"><button className="outline-button" disabled={saving} onClick={() => setSession(null)}>Change session</button></div>
        <AttendanceRegister key={`${session.eventId || "general"}:${session.attendanceDate}`} churchId={churchId} directory={directory} session={session} onSavingChange={setSaving} /></>
      : <AttendanceSessionForm churchId={churchId} events={directory.events} onOpen={setSession} />}
  </section>;
}
