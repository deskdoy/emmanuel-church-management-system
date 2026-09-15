import { useEffect, useState } from "react";
import { assignMemberFamily, deleteFamily, loadFamilyMembers, updateFamily, type Family, type FamilyInput, type FamilyMember } from "../../services/families";
import { getSupabase } from "../../lib/supabase";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole, projectManagerRoles } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { FamilyForm } from "./FamilyForm";
import "./families.css";

export interface FamilyProfileProps {
  churchId: string;
  family: Family;
  onBack: () => void;
  onFamilyChange: (family: Family) => void;
  onDeleted: () => void;
}

type Candidate = { id: string; first_name: string; middle_name: string; last_name: string; member_number: string | null };

export function FamilyProfile(props: FamilyProfileProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.family.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="This family must belong to your active church." /></section>;
  }
  return <FamilyDetails key={`${props.churchId}:${props.family.id}:${activeRole}:${scopeVersion}`} {...props} role={activeRole} />;
}

function FamilyDetails({ churchId, family, role, onBack, onFamilyChange, onDeleted }: FamilyProfileProps & { role: RoleName }) {
  const canManage = hasChurchRole(role, projectManagerRoles);
  const canDelete = hasChurchRole(role, ["Admin", "Pastor"]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const load = async () => {
      // The family service owns grouping operations. This directory lookup only
      // supplies unassigned choices and uses the same church-scoped member RLS.
      const [linked, available] = await Promise.all([
        loadFamilyMembers(churchId, family.id),
        canManage ? getSupabase().from("members").select("id,first_name,middle_name,last_name,member_number")
          .eq("church_id", churchId).is("family_id", null).order("last_name").order("first_name")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (available.error) throw new Error(`Unable to load available members: ${available.error.message}`);
      if (!cancelled) {
        setMembers(linked.filter(row => row.churchId === churchId && row.familyId === family.id));
        setCandidates(available.data || []);
        setSelectedMemberId("");
      }
    };
    void load().catch(cause => {
      if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load family members.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId, family.id, canManage, reload]);

  const saveDetails = async (input: FamilyInput) => {
    if (!canManage || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      onFamilyChange(await updateFamily(churchId, family.id, input));
      setEditing(false); setNotice("Family updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update family."); }
    finally { setSaving(false); }
  };

  const assign = async (memberId: string, familyId: string | null) => {
    if (!canManage || saving || loading || loadError) return;
    if (familyId && !candidates.some(row => row.id === memberId)) return;
    if (!familyId && !members.some(row => row.id === memberId)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await assignMemberFamily(churchId, memberId, familyId);
      setNotice(familyId ? "Member added to family." : "Member removed from family.");
      setLoading(true); setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update family membership."); }
    finally { setSaving(false); }
  };

  const removeFamily = async () => {
    if (!canDelete || saving || loading || loadError || members.length) return;
    if (!window.confirm(`Delete family "${family.name}"?`)) return;
    setSaving(true); setError(""); setNotice("");
    try { await deleteFamily(churchId, family.id); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete family."); }
    finally { setSaving(false); }
  };

  return <section className="family-workspace" aria-label="Family profile">
    <section className="panel">
      <div className="panel-head family-toolbar">
        <div><p className="eyebrow">Family profile</p><h2>{family.name}</h2></div>
        <div className="row-actions family-actions">
          <button className="outline-button" disabled={saving} onClick={onBack}>Back to families</button>
          {canManage && !editing && <button className="outline-button" disabled={saving} onClick={() => { setError(""); setEditing(true); }}>Edit family</button>}
          {canDelete && !editing && <button className="outline-button" disabled={saving || loading || !!loadError || members.length > 0} onClick={() => void removeFamily()}>Delete family</button>}
        </div>
      </div>
      <p className="family-notes">{family.notes || "No family notes yet."}</p>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage families.</p>}
      {canDelete && members.length > 0 && <p className="form-help">Remove members from this family before deleting it. Their member records are retained.</p>}
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {error && !editing && <div className="error-banner" role="alert">{error}</div>}
    {editing ? <FamilyForm family={family} canManage={canManage} saving={saving} error={error} onSubmit={saveDetails} onCancel={() => { setEditing(false); setError(""); }} />
      : loading ? <section className="panel"><LoadingSkeleton rows={4} label="Loading family members" /></section>
      : loadError ? <div className="error-banner" role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : <>
        {canManage && <section className="panel">
          <form className="record-form" aria-label="Add member to family" onSubmit={event => { event.preventDefault(); if (selectedMemberId) void assign(selectedMemberId, family.id); }}>
            <label>Unassigned member<select required disabled={saving || !candidates.length} value={selectedMemberId} onChange={event => setSelectedMemberId(event.target.value)}>
              <option value="">Select a member</option>
              {candidates.map(member => <option key={member.id} value={member.id}>{[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(" ")}{member.member_number ? ` (${member.member_number})` : ""}</option>)}
            </select></label>
            {!candidates.length && <p className="form-help">No unassigned members available in this church.</p>}
            <div className="row-actions"><button className="primary-button" disabled={saving || !selectedMemberId}>Add to family</button></div>
          </form>
        </section>}
        <section className="panel table-panel">
          <div className="panel-head"><h3>Family members</h3><span>{members.length} members</span></div>
          {members.length ? <div className="table-wrap responsive-table"><table>
            <thead><tr><th>Name</th><th>Member number</th><th>Phone</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead>
            <tbody>{members.map(member => <tr key={member.id}>
              <td data-label="Name">{[member.firstName, member.middleName, member.lastName].filter(Boolean).join(" ")}</td>
              <td data-label="Member number">{member.memberNumber || "-"}</td><td data-label="Phone">{member.phone || "-"}</td><td data-label="Status">{member.membershipStatus}</td>
              {canManage && <td data-label="Action"><button className="table-action" disabled={saving} onClick={() => void assign(member.id, null)}>Remove from family</button></td>}
            </tr>)}</tbody>
          </table></div> : <EmptyState title="No family members yet" description={canManage ? "Choose an unassigned church member to add to this family." : "Members will appear here once they are assigned to this family."} />}
        </section>
      </>}
  </section>;
}
