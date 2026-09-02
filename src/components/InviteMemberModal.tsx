import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  loadInvitationRoles,
} from "../services/invitations";

import {
  inviteMemberAsUser,
} from "../services/memberAccess";



type InviteMemberModalProps = {

  churchId: string;

  memberId: string;

  memberName: string;

  memberEmail: string;

  invitedBy: string;

  onClose: () => void;

  onSent: () => void;

};



type Role = {

  id: string;

  name: string;

};



export function InviteMemberModal({

  churchId,

  memberId,

  memberName,

  memberEmail,

  invitedBy,

  onClose,

  onSent,

}: InviteMemberModalProps) {


  const [roles, setRoles] =
    useState<Role[]>([]);


  const [selectedRole, setSelectedRole] =
    useState("");


  const [email, setEmail] =
    useState(memberEmail || "");


  const [saving, setSaving] =
    useState(false);


  const [error, setError] =
    useState("");



  useEffect(() => {

    async function loadRoles() {

      try {

        const data =
          await loadInvitationRoles();


        setRoles(data);


        if (data.length) {

          setSelectedRole(
            data[0].id
          );

        }


      } catch(error) {

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load roles."
        );

      }

    }


    void loadRoles();

  }, []);





  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    setSaving(true);
    setError("");



    try {


      await inviteMemberAsUser({

        churchId,

        memberId,

        memberName,

        memberEmail:
          email,

        roleId:
          selectedRole,

        invitedBy,


      });


      onSent();


    } catch(error) {


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

    <div className="modal-backdrop">


      <section className="modal">


        <div className="modal-head">


          <div>

            <p className="eyebrow">
              User Access
            </p>


            <h2>
              Invite Member
            </h2>


          </div>


          <button

            className="close-button"

            onClick={onClose}

          >
            ×
          </button>


        </div>




        <form
          className="record-form"
          onSubmit={submit}
        >


          <div className="form-grid">



            <label className="full">

              Member Name

              <input

                value={memberName}

                readOnly

              />

            </label>




            <label className="full">

              Email

              <input

                type="email"

                value={email}

                onChange={
                  event =>
                    setEmail(
                      event.target.value
                    )
                }

                required

              />

            </label>




            <label className="full">

              System Role

              <select

                value={selectedRole}

                onChange={
                  event =>
                    setSelectedRole(
                      event.target.value
                    )
                }

                required

              >

                {
                  roles.map(
                    role => (

                      <option

                        key={role.id}

                        value={role.id}

                      >

                        {
                          role.name
                        }

                      </option>

                    )
                  )
                }


              </select>


            </label>



          </div>



          {
            error && (

              <div className="form-error">

                {error}

              </div>

            )
          }




          <div className="row-actions">


            <button

              type="button"

              className="outline-button"

              onClick={onClose}

              disabled={saving}

            >

              Cancel

            </button>




            <button

              className="primary-button"

              disabled={saving}

            >

              {
                saving
                  ? "Sending..."
                  : "Send Invitation"
              }

            </button>


          </div>



        </form>


      </section>


    </div>

  );

}