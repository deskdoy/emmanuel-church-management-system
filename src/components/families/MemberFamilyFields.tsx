import { useEffect, useId, useState } from "react";
import { loadFamilies, type Family } from "../../services/families";

function useMemberFamilies(churchId: string) {
  const [result, setResult] = useState<{ churchId: string; families: Family[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    void loadFamilies(churchId).then(families => {
      if (!cancelled) setResult({ churchId, families: families.filter(family => family.churchId === churchId), error: "" });
    }).catch(cause => {
      if (!cancelled) setResult({ churchId, families: [], error: cause instanceof Error ? cause.message : "Unable to load families." });
    });
    return () => { cancelled = true; };
  }, [churchId, attempt]);
  return { result: result?.churchId === churchId ? result : null, retry: () => setAttempt(value => value + 1) };
}

export function MemberFamilySelect({ churchId, familyId, disabled }: { churchId: string; familyId: string | null; disabled: boolean }) {
  const { result, retry } = useMemberFamilies(churchId);
  const helpId = useId();
  const [selectedId, setSelectedId] = useState(familyId || "");
  const families = result?.families || [];
  return <div className="full">
    <label htmlFor={`${helpId}-select`}>Family</label>
    <select id={`${helpId}-select`} name="family_id" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={disabled || !result || !!result.error} aria-describedby={helpId}>
      <option value="">No family</option>
      {selectedId && !families.some(family => family.id === selectedId) && <option value={selectedId}>Current family</option>}
      {families.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
    </select>
    <div id={helpId}>
      {!result ? <p className="form-help" role="status">Loading families...</p>
        : result.error ? <div className="form-help" role="alert">{result.error} Current family assignment will be kept. <button type="button" className="table-action" disabled={disabled} onClick={retry}>Retry families</button></div>
        : !families.length ? <p className="form-help">No families available. Create one in Families to group members.</p> : null}
    </div>
  </div>;
}

export function MemberFamilyName({ churchId, familyId }: { churchId: string; familyId: string | null }) {
  return familyId ? <AssignedFamilyName churchId={churchId} familyId={familyId} /> : <b>No family</b>;
}

function AssignedFamilyName({ churchId, familyId }: { churchId: string; familyId: string }) {
  const { result, retry } = useMemberFamilies(churchId);
  if (!result) return <b role="status">Loading family...</b>;
  if (result.error) return <div role="alert">Unable to load assigned family. <button type="button" className="table-action" onClick={retry}>Retry family</button></div>;
  return <b>{result.families.find(family => family.id === familyId)?.name || "Assigned family unavailable"}</b>;
}
