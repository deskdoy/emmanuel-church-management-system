import { useCallback, useEffect, useState } from "react";
import {
  cancelChurchInvitation,
  loadChurchInvitations,
  resendChurchInvitation,
} from "../services/invitations";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";


type TeamInvitationsViewProps = {
  churchId: string;
};



type Invitation = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  invited_at: string | null;
  expires_at: string | null;
  role?: {
  name?: string;
} | null;
};



export function TeamInvitationsView({
  churchId,
}: TeamInvitationsViewProps) {


  const [invitations, setInvitations] =
    useState<Invitation[]>([]);


  const [loading, setLoading] =
    useState(true);


  const [processingId, setProcessingId] =
    useState("");


  const [error, setError] =
    useState("");


  const [notice, setNotice] =
    useState("");



  const refresh = useCallback(
    async () => {

      setLoading(true);
      setError("");

      try {

        const data =
          await loadChurchInvitations(
            churchId
          );


        setInvitations(
          data as Invitation[]
        );


      } catch (error) {

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load invitations."
        );

      } finally {

        setLoading(false);

      }

    },
    [
      churchId,
    ]
  );



  useEffect(() => {

    void refresh();

  }, [
    refresh,
  ]);




  async function resend(
    invitationId: string
  ) {

    setProcessingId(invitationId);
    setError("");
    setNotice("");

    try {

      await resendChurchInvitation(
        invitationId
      );


      setNotice(
        "Invitation resent successfully."
      );


    } catch(error) {

      setError(
        error instanceof Error
          ? error.message
          : "Unable to resend invitation."
      );

    } finally {

      setProcessingId("");

    }

  }





  async function cancel(
    invitationId: string
  ) {

    setProcessingId(invitationId);
    setError("");
    setNotice("");

    try {

      await cancelChurchInvitation(
        invitationId
      );


      setNotice(
        "Invitation cancelled."
      );


      await refresh();


    } catch(error) {

      setError(
        error instanceof Error
          ? error.message
          : "Unable to cancel invitation."
      );

    } finally {

      setProcessingId("");

    }

  }





  return (

    <section className="panel table-panel">


      <div className="panel-head">

        <div>

          <p className="eyebrow">
            Team Invitations
          </p>

          <h2>
            Pending invitations
          </h2>

          <p className="section-copy">
            Manage invited church team members.
          </p>

        </div>


        <span className="period-button">
          {invitations.length} invitations
        </span>


      </div>




      {notice && (

        <div className="form-success">
          {notice}
        </div>

      )}



      {error && (

        <div className="error-banner">
          {error}
        </div>

      )}




      {
        loading ? (

          <LoadingSkeleton
            rows={5}
            label="Loading invitations"
          />

        ) : invitations.length === 0 ? (

          <EmptyState

            compact

            title="No invitations"

            description="Invited team members will appear here."

          />

        ) : (


          <div className="table-wrap responsive-table">

            <table>

              <thead>

                <tr>

                  <th>
                    Name
                  </th>

                  <th>
                    Email
                  </th>

                  <th>
                    Role
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Invited
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

              {
                invitations.map(
                  invitation => (

                    <tr
                      key={
                        invitation.id
                      }
                    >

                      <td data-label="Name">
                        {
                          invitation.full_name
                        }
                      </td>


                      <td data-label="Email">
                        {
                          invitation.email
                        }
                      </td>


                      <td data-label="Role">
                        {
                          invitation.role?.name ||
                          "Unknown"
                        }
                      </td>


                      <td data-label="Status">
                        {
                          invitation.status
                        }
                      </td>


                      <td data-label="Invited">

                        {
                          invitation.invited_at
                            ? new Date(
                                invitation.invited_at
                              ).toLocaleDateString()
                            : "-"
                        }

                      </td>


                      <td data-label="Action">


                        <button

                          className="table-action"

                          disabled={
                            processingId === invitation.id
                          }

                          onClick={() =>
                            void resend(
                              invitation.id
                            )
                          }

                        >

                          Resend

                        </button>



                        <button

                          className="table-action"

                          disabled={
                            processingId === invitation.id
                          }

                          onClick={() =>
                            void cancel(
                              invitation.id
                            )
                          }

                        >

                          Cancel

                        </button>


                      </td>


                    </tr>

                  )
                )
              }


              </tbody>


            </table>

          </div>


        )

      }


    </section>

  );

}