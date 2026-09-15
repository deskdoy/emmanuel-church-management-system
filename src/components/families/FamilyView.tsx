import { useEffect, useState } from "react";
import { createFamily, loadFamilies, type Family, type FamilyInput } from "../../services/families";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole, projectManagerRoles } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { FamilyForm } from "./FamilyForm";
import { FamilyProfile } from "./FamilyProfile";
import "./families.css";

export function FamilyView({ churchId }: { churchId: string }) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open families from your active church workspace." /></section>;
  }
  return <FamilyWorkspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} role={activeRole} />;
}

function FamilyWorkspace({ churchId, role }: { churchId: string; role: RoleName }) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  // These existing roles match family INSERT/UPDATE permissions.
  const canManage = hasChurchRole(role, projectManagerRoles);
  const selected = families.find(family => family.id === selectedId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void loadFamilies(churchId).then(rows => {
      if (!cancelled) setFamilies(rows.filter(row => row.churchId === churchId));
    }).catch(cause => {
      if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load families.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId, reload]);

  const create = async (input: FamilyInput) => {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      const family = await createFamily(churchId, input);
      setFamilies(rows => [...rows, family]);
      setFormOpen(false);
      setSelectedId(family.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create family.");
    } finally { setSaving(false); }
  };

  if (selected) return <FamilyProfile churchId={churchId} family={selected}
    onBack={() => setSelectedId(null)}
    onFamilyChange={family => setFamilies(rows => rows.map(row => row.id === family.id ? family : row))}
    onDeleted={() => {
      setFamilies(rows => rows.filter(row => row.id !== selected.id));
      setSelectedId(null);
      setNotice("Family deleted.");
    }} />;

  return <section className="family-workspace" aria-label="Family Grouping">
    <section className="panel">
      <div className="panel-head family-toolbar">
        <div><p className="eyebrow">Church community</p><h2>Families</h2><p className="section-copy">Group members into families and keep household connections together.</p></div>
        {canManage && !formOpen && <button className="primary-button" disabled={loading || !!loadError} onClick={() => { setError(""); setNotice(""); setFormOpen(true); }}>New family</button>}
      </div>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage families.</p>}
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {formOpen && <FamilyForm canManage={canManage} saving={saving} error={error} onSubmit={create} onCancel={() => setFormOpen(false)} />}
    {loading ? <section className="panel"><LoadingSkeleton rows={4} label="Loading families" /></section>
      : loadError ? <div className="error-banner" role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : families.length ? <div className="project-grid">{families.map(family => <article className="project-card" key={family.id}>
        <h3>{family.name}</h3><p>{family.notes || "No family notes yet."}</p>
        <button className="outline-button" disabled={formOpen} onClick={() => { setSelectedId(family.id); setNotice(""); }}>View family</button>
      </article>)}</div>
      : <section className="panel"><EmptyState title="No families yet" description={canManage ? "Create a family, then add church members to it." : "Families will appear here when your church creates them."} /></section>}
  </section>;
}
