import { useEffect, useMemo, useState } from "react";
import { loadAttendanceRecords, type AttendanceRecord } from "../../services/attendance";
import { buildAttendanceReport, type AttendanceSummary } from "../../reporting/attendanceCalculations";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import type { AttendanceDirectory } from "./types";
import "./attendance.css";

export interface AttendanceReportsProps { churchId: string; directory: AttendanceDirectory }
const rate = (value: number | null) => value === null ? "No records" : `${value}%`;

export function AttendanceReports(props: AttendanceReportsProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.directory.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="Attendance reports must belong to your active church." />;
  }
  return <Reports key={`${props.churchId}:${activeRole}:${scopeVersion}`} {...props} />;
}

function Summary({ summary }: { summary: AttendanceSummary }) {
  return <dl className="attendance-report-metrics">
    {[ ["Attendance rate", rate(summary.attendanceRate)], ["Recorded attendance", summary.totalRecords],
      ["Present", summary.present], ["Late", summary.late], ["Absent", summary.absent], ["Excused", summary.excused],
      ["Members recorded", summary.memberCount], ["Sessions recorded", summary.sessionCount] ].map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function Reports({ churchId, directory }: AttendanceReportsProps) {
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [memberId, setMemberId] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRecords(null); setError("");
    void loadAttendanceRecords(churchId).then(rows => {
      if (!cancelled) setRecords(rows.filter(row => row.churchId === churchId));
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load attendance reports.");
    });
    return () => { cancelled = true; };
  }, [churchId, reload]);
  const result = useMemo(() => {
    try {
      return { report: buildAttendanceReport(churchId, records || [], directory.members, directory.families, { from: dateFrom, to: dateTo }), error: "" };
    } catch (cause) {
      return { report: null, error: cause instanceof Error ? cause.message : "Unable to calculate attendance reports." };
    }
  }, [churchId, records, directory.members, directory.families, dateFrom, dateTo]);
  const report = result.report;
  const member = report?.members.find(row => row.memberId === memberId);
  const events = new Map(directory.events.filter(row => row.churchId === churchId).map(row => [row.id, row.title]));
  return <section className="attendance-workspace" aria-label="Attendance reports">
    <section className="panel"><div className="panel-head"><h2>Attendance reports</h2><button className="outline-button" onClick={() => setReload(value => value + 1)}>Refresh reports</button></div>
      <p className="form-help">Attendance rate = (Present + Late) / all recorded attendance, including Absent and Excused. Unrecorded attendance is excluded. No records means no rate is available.</p>
      <div className="form-grid">
        <label>From date<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
        <label>To date<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
      </div>
    </section>
    {error ? <div className="error-banner" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : records === null ? <section className="panel"><LoadingSkeleton rows={4} label="Loading attendance reports" /></section>
      : result.error ? <div className="error-banner" role="alert">{result.error}</div>
      : report && (!report.summary.totalRecords ? <section className="panel"><EmptyState title="No attendance records" description="No recorded attendance matches this date range." /></section> : <>
        <section className="panel" aria-label="Overall attendance summary"><h2>Overall attendance summary</h2><Summary summary={report.summary} /></section>
        <section className="panel" aria-label="Member attendance report"><h2>Member attendance history</h2>
          <label htmlFor="attendance-report-member">Member</label><select id="attendance-report-member" value={memberId} onChange={event => setMemberId(event.target.value)}>
            <option value="">Select member</option>{report.members.map(row => <option key={row.memberId} value={row.memberId}>{row.name}</option>)}
          </select>
          {!member ? <EmptyState title="Choose a member" description="Select a member to review their attendance rate and history." />
            : !member.history.length ? <EmptyState title="No member attendance" description="This member has no recorded attendance in this date range." /> : <>
              <Summary summary={member.summary} />
              <div className="table-wrap responsive-table"><table><thead><tr><th>Date</th><th>Event</th><th>Status</th></tr></thead><tbody>
                {member.history.map(row => <tr key={row.id}><td data-label="Date">{row.attendanceDate}</td><td data-label="Event">{row.eventId ? events.get(row.eventId) || "Event unavailable" : "General attendance"}</td><td data-label="Status">{row.status}</td></tr>)}
              </tbody></table></div>
            </>}
        </section>
        <section className="panel" aria-label="Family attendance summary"><h2>Family attendance summary</h2>
          <p className="form-help">Includes attendance of members currently assigned to each family. Rates are calculated from their combined records.</p>
          {!report.families.length ? <EmptyState title="No families available" description="No families are available in this church." /> : <div className="table-wrap responsive-table"><table>
            <thead><tr><th>Family</th><th>Current members</th><th>Recorded attendance</th><th>Present / Late</th><th>Absent / Excused</th><th>Attendance rate</th></tr></thead>
            <tbody>{report.families.map(row => <tr key={row.familyId}><td data-label="Family">{row.name}</td><td data-label="Current members">{row.memberCount}</td><td data-label="Recorded attendance">{row.summary.totalRecords}</td><td data-label="Present / Late">{row.summary.present} / {row.summary.late}</td><td data-label="Absent / Excused">{row.summary.absent} / {row.summary.excused}</td><td data-label="Attendance rate">{rate(row.summary.attendanceRate)}</td></tr>)}</tbody>
          </table></div>}
        </section>
        <section className="panel" aria-label="Attendance trend"><h2>Attendance trend</h2><p className="form-help">Daily totals for dates with recorded attendance.</p>
          <div className="table-wrap responsive-table"><table><thead><tr><th>Date</th><th>Sessions</th><th>Recorded attendance</th><th>Attended</th><th>Attendance rate</th></tr></thead>
            <tbody>{report.trend.map(row => <tr key={row.date}><td data-label="Date">{row.date}</td><td data-label="Sessions">{row.summary.sessionCount}</td><td data-label="Recorded attendance">{row.summary.totalRecords}</td><td data-label="Attended">{row.summary.attended}</td><td data-label="Attendance rate"><span>{rate(row.summary.attendanceRate)}</span> <progress aria-label={`Attendance rate for ${row.date}`} max={100} value={row.summary.attendanceRate ?? 0} /></td></tr>)}</tbody>
          </table></div>
        </section>
      </>)}
  </section>;
}
