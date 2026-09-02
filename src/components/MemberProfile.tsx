import {
  useEffect,
  useState,
} from "react";
import { MemberForm } from "./MemberForm";
import { InviteMemberModal } from "./InviteMemberModal";
import {
  loadMemberAccessStatus,
  type MemberAccessStatus,
} from "../services/memberAccessStatus";

type MemberProfileProps = {
  member: {
    id: string;
    church_id: string;
    created_by: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    birth_date: string | null;
    joined_at: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    membership_status: string | null;
    ministry: string | null;
    notes: string | null;
  };

  onClose: () => void;

  onEdit: () => void;
};



export function MemberProfile({
  member,
  onClose,
  onEdit,
}: MemberProfileProps) {


  const [editing, setEditing] =
    useState(false);

    const [showInvite, setShowInvite] =
  useState(false);

  const [accessStatus, setAccessStatus] =
  useState<MemberAccessStatus>({
    status: "none",
  });



  const fullName =
    [
      member.first_name,
      member.middle_name,
      member.last_name,
    ]
      .filter(Boolean)
      .join(" ");

useEffect(() => {

  async function loadAccess() {

    const result =
      await loadMemberAccessStatus(
        member.church_id,
        member.email || ""
      );

    setAccessStatus(result);

  }


  void loadAccess();

}, [
  member.church_id,
  member.email,
]);


  return (

    <section className="panel table-panel">


      <div className="panel-head">


        <div>

          <p className="eyebrow">
            Member Profile
          </p>


          <h2>
            {fullName}
          </h2>

        </div>



        <div className="row-actions">


          {
            !editing && (

              <button
                className="table-action"
                onClick={() =>
                  setEditing(true)
                }
              >
                Edit
              </button>

            )
          }


<button

  className="table-action"

  onClick={() =>
    setShowInvite(true)
  }

>
  Invite as User
</button>


          <button
            className="outline-button"
            onClick={onClose}
          >
            Close
          </button>


        </div>


      </div>





      {
        editing && (

          <MemberForm

            member={member}

            churchId={member.church_id}

            userId={member.created_by}

            onSaved={() => {

              setEditing(false);

              onEdit();

            }}

            onCancel={() =>
              setEditing(false)
            }

          />

        )
      }






      {
        !editing && (

          <div className="detail-grid">


            <div>

              <span>
                Birth Date
              </span>

              <b>
                {member.birth_date || "-"}
              </b>

            </div>




            <div>

              <span>
                Joined
              </span>

              <b>
                {member.joined_at || "-"}
              </b>

            </div>




            <div>

              <span>
                Phone
              </span>

              <b>
                {member.phone || "-"}
              </b>

            </div>




            <div>

              <span>
                Email
              </span>

              <b>
                {member.email || "-"}
              </b>

            </div>




            <div className="detail-full">

              <span>
                Address
              </span>

              <b>
                {member.address || "-"}
              </b>

            </div>




            <div>

              <span>
                Membership Status
              </span>

              <b>
                {member.membership_status || "-"}
              </b>

            </div>




            <div>

              <span>
                Ministry
              </span>

              <b>
                {member.ministry || "-"}
              </b>

            </div>



<div>

  <span>
    System Access
  </span>

  <b>
    {
      accessStatus.status === "none"
        ? "Not invited"
        : accessStatus.status === "pending"
          ? "Pending Invitation"
          : "Active User"
    }
  </b>

</div>


<div>

  <span>
    System Role
  </span>

  <b>
    {
      accessStatus.role || "-"
    }
  </b>

</div>




            <div className="detail-full">

              <span>
                Notes
              </span>

              <b>
                {member.notes || "-"}
              </b>

            </div>



          </div>

        )
      }

{
  showInvite && (

    <InviteMemberModal

      churchId={member.church_id}

      memberId={member.id}

      memberName={fullName}

      memberEmail={member.email || ""}

      invitedBy={member.created_by}

      onClose={() =>
        setShowInvite(false)
      }

      onSent={() =>
        setShowInvite(false)
      }

    />

  )
}

    </section>

  );

}