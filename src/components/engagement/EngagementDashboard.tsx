import { useEffect, useState } from "react";
import { loadEngagementSummary, type EngagementSummary } from "../../services/engagement";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { EngagementMetricCard } from "./EngagementMetricCard";
import "./engagement.css";

export interface EngagementDashboardProps { churchId: string }

export function EngagementDashboard({ churchId }: EngagementDashboardProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  // Ministry summaries share the existing read access for active church roles.
  if (!churchId.trim() || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open engagement insights from your active church workspace." /></section>;
  }
  return <Workspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} />;
}

type Result = { summary: EngagementSummary; error?: never } | { summary?: never; error: string };

function Workspace({ churchId }: EngagementDashboardProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadEngagementSummary(churchId).then(summary => {
      if (cancelled) return;
      if (summary.churchId !== churchId) throw new Error("Engagement results do not belong to the active church.");
      setResult({ summary });
    }).catch(cause => {
      if (!cancelled) setResult({ error: cause instanceof Error ? cause.message : "Unable to load engagement insights." });
    });
    return () => { cancelled = true; };
  }, [churchId, reload]);
  const refresh = () => { setResult(null); setReload(value => value + 1); };
  const summary = result?.summary;
  const attendance = summary?.attendanceSummary;
  const empty = summary && !summary.memberCount && !summary.familyCount && !summary.attendanceSummary.totalRecords
    && !summary.upcomingEventsCount && !summary.activeAnnouncementsCount;

  return <section className="engagement-dashboard" aria-label="Engagement dashboard" aria-busy={!result}>
    <section className="panel"><div className="panel-head"><div>
      <p className="eyebrow">Church community</p><h2>Engagement dashboard</h2>
      <p className="section-copy">Members, families, attendance, and current church activity.</p>
    </div><button type="button" className="outline-button" disabled={!result} onClick={refresh}>Refresh engagement</button></div>
      {summary && <p className="form-help">Updated <time dateTime={summary.asOf}>{new Date(summary.asOf).toLocaleString()}</time>. Events and announcements reflect this refresh.</p>}
    </section>
    {!result ? <section className="panel"><LoadingSkeleton rows={5} label="Loading engagement insights" /></section>
      : result.error !== undefined ? <div className="error-banner" role="alert"><span>{result.error}</span><button type="button" onClick={refresh}>Try again</button></div>
      : summary && attendance && <>
        {empty && <section className="panel"><EmptyState title="No engagement activity yet" description="No members, families, attendance records, upcoming events, or active announcements are available in this church." /></section>}
        <section className="engagement-metrics" aria-label="Engagement metrics">
          <EngagementMetricCard label="Members" value={summary.memberCount} description="All recorded members, including inactive members" />
          <EngagementMetricCard label="Families" value={summary.familyCount} description="Family groups in this church" />
          <EngagementMetricCard label="Attendance" value={attendance.attendanceRate === null ? "No records" : `${attendance.attendanceRate}%`}
            description={attendance.totalRecords ? `${attendance.attended.toLocaleString()} attended out of ${attendance.totalRecords.toLocaleString()} recorded attendance entries, across all dates` : "No recorded attendance to calculate a rate"} />
          <EngagementMetricCard label="Events" value={summary.upcomingEventsCount} description="Upcoming events starting at or after the last refresh" />
          <EngagementMetricCard label="Announcements" value={summary.activeAnnouncementsCount} description="Published announcements currently within their schedule" />
        </section>
        <section className="panel" aria-label="Attendance summary"><h2>Attendance summary</h2>
          {!attendance.totalRecords ? <EmptyState compact title="No attendance records" description="Attendance insights will appear when attendance is recorded." /> : <>
            <dl className="engagement-attendance">{([
              ["Present", attendance.present], ["Late", attendance.late], ["Absent", attendance.absent], ["Excused", attendance.excused],
              ["Members recorded", attendance.memberCount], ["Sessions recorded", attendance.sessionCount],
            ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>
            <p className="form-help">Attendance rate is Present plus Late divided by all recorded statuses, including Absent and Excused. Unrecorded attendance is excluded.</p>
          </>}
        </section>
      </>}
  </section>;
}
