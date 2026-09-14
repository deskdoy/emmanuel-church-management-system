import { useEffect, useState } from "react";
import type { AppUser } from "../types";
import {
  loadChurchSettings,
  updateFinancialApprovalSetting
} from "../services/churchSettings";

export function SettingsView({
  profile,
  connected,
  churchId
}: {
  profile:AppUser;
  connected:boolean;
  churchId:string;
}) {


  const [
    approvalRequired,
    setApprovalRequired
  ] = useState(false);


  const [
    savingApproval,
    setSavingApproval
  ] = useState(false);

useEffect(()=>{

  void loadChurchSettings(churchId)
    .then(settings=>{

      if(settings){

        setApprovalRequired(
          settings.financial_approval_required
        );

      }

    });

},[churchId]);

const toggleApproval = async () => {

  const next =
    !approvalRequired;


  setSavingApproval(true);


  try {

    await updateFinancialApprovalSetting(
      churchId,
      next
    );


    setApprovalRequired(next);


  } finally {

    setSavingApproval(false);

  }

};

  return <section className="settings-grid"><article className="panel settings-card"><p className="eyebrow">Account</p><h2>Signed-in profile</h2><dl><div><dt>Name</dt><dd>{profile.fullName||"Not provided"}</dd></div><div><dt>Email</dt><dd>{profile.email}</dd></div><div><dt>Role</dt><dd><span className="status paid">{profile.role}</span></dd></div><div><dt>Status</dt><dd>{profile.isActive?"Active":"Inactive"}</dd></div></dl></article><article className="panel settings-card"><p className="eyebrow">Application</p><h2>System settings</h2><dl><div><dt>Currency</dt><dd>Philippine Peso (PHP)</dd></div><div><dt>Database</dt><dd><span className={`connection-chip ${connected?"connected":""}`}>{connected?"Connected":"Connection pending"}</span></dd></div><div><dt>Financial records</dt><dd>Supabase PostgreSQL</dd></div><div><dt>Hosting</dt><dd>Vercel-compatible Vite build</dd></div></dl><p className="audit-note">Security, authentication, and role configuration are managed centrally and cannot be changed from this screen.</p></article>
  <article className="panel settings-card">

  <p className="eyebrow">
    Financial Controls
  </p>

  <h2>
    Transaction Approval
  </h2>


  <dl>

    <div>

      <dt>
        Require Approval
      </dt>


      <dd>

        <button
          type="button"
          className="outline-button"
          role="switch"
          aria-label="Require transaction approval"
          aria-checked={approvalRequired}
          aria-busy={savingApproval}
          disabled={savingApproval}
          onClick={toggleApproval}
        >

          <span className={`status ${approvalRequired ? "paid" : "unpaid"}`}>
            {approvalRequired ? "ON" : "OFF"}
          </span>
          {" "}
          {savingApproval ? "Saving..." : approvalRequired ? "Turn off" : "Turn on"}

        </button>

      </dd>

    </div>


  </dl>


  <p className="audit-note">

    When enabled, financial records created by
    Encoder users require Treasurer/Admin approval
    before becoming official records.

  </p>


</article></section>;
}
