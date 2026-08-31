import { FormEvent, useEffect, useState } from "react";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { useAuth } from "../../auth/AuthContext";
import {
  createChurchInvitation,
  loadInvitationRoles,
} from "../../services/invitations";
import { completeChurchSetup } from "../../services/setup";

type RoleOption = {
  id: string;
  name: string;
};


type TeamSetupStepProps = {
  onComplete: () => void;
};



export function TeamSetupStep({
  onComplete,
}: TeamSetupStepProps) {


  const { activeChurch } = useActiveChurch();
  const { profile } = useAuth();


  const [roles, setRoles] = useState<RoleOption[]>([]);

  const [roleId, setRoleId] = useState("");

  const [fullName, setFullName] = useState("");

  const [email, setEmail] = useState("");

  const [loadingRoles, setLoadingRoles] = useState(true);

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");

  const [error, setError] = useState("");



  useEffect(() => {

    async function loadRoles() {

      try {

        const data =
          await loadInvitationRoles();

        setRoles(data);

        if (data.length) {
          setRoleId(data[0].id);
        }

      } catch (error) {

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load roles."
        );

      } finally {

        setLoadingRoles(false);

      }

    }


    loadRoles();

  }, []);





  async function submitInvitation(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    if (!activeChurch || !profile) {
      return;
    }


    setSaving(true);
    setMessage("");
    setError("");



    try {


      await createChurchInvitation({

        churchId:
          activeChurch.id,

        email,

        fullName,

        roleId,

        invitedBy:
          profile.id,

      });



      setMessage(
        "Invitation sent successfully."
      );


      setFullName("");
      setEmail("");



    } catch (error) {


      setError(
        error instanceof Error
          ? error.message
          : "Unable to send invitation."
      );


    } finally {

      setSaving(false);

    }

  }





  return (

    <section className="record-form">


      <p className="eyebrow">
        Church Setup · Step 3
      </p>


      <h2>
        Build your church team
      </h2>


      <p className="login-copy">
        Invite people who will help manage
        your church workspace.
      </p>



      {error && (

        <div className="form-error">
          {error}
        </div>

      )}



      {message && (

        <div className="form-success">
          {message}
        </div>

      )}




      <form
        onSubmit={submitInvitation}
      >


        <div className="form-grid">


          <label className="full">

            Full Name

            <input
              value={fullName}
              onChange={
                event =>
                  setFullName(
                    event.target.value
                  )
              }
              placeholder="John Smith"
              required
            />

          </label>



          <label className="full">

            Email Address

            <input
              type="email"
              value={email}
              onChange={
                event =>
                  setEmail(
                    event.target.value
                  )
              }
              placeholder="john@example.com"
              required
            />

          </label>




          <label className="full">

            Role


            <select

              value={roleId}

              onChange={
                event =>
                  setRoleId(
                    event.target.value
                  )
              }

              disabled={loadingRoles}

              required

            >

              {
                roles.map(role => (

                  <option
                    key={role.id}
                    value={role.id}
                  >
                    {role.name}
                  </option>

                ))
              }

            </select>


          </label>



        </div>



        <button

          className="primary-button form-submit"

          disabled={
            saving ||
            loadingRoles
          }

        >

          {
            saving
              ? "Sending..."
              : "Send Invitation"
          }

        </button>


      </form>




      <button

  className="primary-button form-submit"

  onClick={async () => {

    if (!activeChurch) return;

    try {

      console.log(
  "COMPLETING SETUP FOR CHURCH:",
  activeChurch.id
);


await completeChurchSetup(
  activeChurch.id
);

      onComplete();

    } catch(error) {

      setError(
        error instanceof Error
          ? error.message
          : "Unable to complete setup."
      );

    }

  }}

>

Complete Setup

</button>



    </section>

  );

}