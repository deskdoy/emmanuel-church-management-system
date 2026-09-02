import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";
import { MemberForm } from "./MemberForm";
import { MemberProfile } from "./MemberProfile";

const client = () => {

  if (!supabase) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  return supabase;

};

type Member = {
  id: string;
  church_id: string;
  created_by: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string | null;
  email: string | null;
  membership_status: string | null;
  ministry: string | null;
  birth_date: string | null;
  joined_at: string | null;
  address: string | null;
  notes: string | null;
};



type MembersViewProps = {
  churchId: string;
  userId: string;
};


export function MembersView({
  churchId,
  userId,
}: MembersViewProps) {


  const [members, setMembers] =
    useState<Member[]>([]);


  const [loading, setLoading] =
    useState(true);


  const [search, setSearch] =
    useState("");


  const [error, setError] =
    useState("");

const [showForm, setShowForm] =
  useState(false);

  const [selectedMember, setSelectedMember] =
  useState<Member | null>(null);

  const loadMembers = useCallback(
    async () => {

      setLoading(true);
      setError("");


      const db = client();


let query =
  db
    .from("members")
         .select(
`
id,
church_id,
created_by,
first_name,
middle_name,
last_name,
birth_date,
joined_at,
phone,
email,
address,
membership_status,
ministry,
notes
`
)
          .eq(
            "church_id",
            churchId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );


      if (search.trim()) {

        query =
          query.or(
            `
            first_name.ilike.%${search}%,
            last_name.ilike.%${search}%,
            email.ilike.%${search}%
            `
          );

      }


      const {
        data,
        error,
      } = await query;



      if (error) {

        setError(
          error.message
        );

        setLoading(false);

        return;

      }



      setMembers(
        data || []
      );


      setLoading(false);

    },
    [
      churchId,
      search,
    ]
  );




  useEffect(() => {

    void loadMembers();

  }, [
    loadMembers,
  ]);




  return (

    <section className="users-module">


      <div className="panel table-panel">


        <div className="panel-head">

          <div>

            <p className="eyebrow">
              Church Members
            </p>


            <h2>
              Member Directory
            </h2>


            <p className="section-copy">
              Manage people connected to your church.
            </p>


          </div>


          <span className="period-button">

            {members.length} members

          </span>


        </div>




        {error && (

          <div className="error-banner">
            {error}
          </div>

        )}





        <div className="member-toolbar">

          <input

            placeholder="Search members..."

            value={search}

            onChange={
              event =>
                setSearch(
                  event.target.value
                )
            }

          />


          <button

  className="primary-button"

  onClick={() =>
    setShowForm(true)
  }

>

  Add Member

</button>


        </div>
{
  selectedMember && (

    <MemberProfile

  member={selectedMember}

  onClose={() =>
    setSelectedMember(null)
  }

  onEdit={async () => {

    await loadMembers();

  }}

/>

  )
}



        {
          loading ? (

            <LoadingSkeleton
              rows={5}
              label="Loading members"
            />

          ) : members.length === 0 ? (

            <EmptyState

              title="No members found"

              description="Add your first church member."

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
                      Phone
                    </th>

                    <th>
                      Email
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Ministry
                    </th>

<th>
  Action
</th>

                  </tr>

                </thead>


                <tbody>

                {
                  members.map(
                    member => (

                      <tr
                        key={
                          member.id
                        }
                      >

                        <td>

                          {
                            `${member.first_name} ${member.last_name}`
                          }

                        </td>


                        <td>
                          {
                            member.phone || "-"
                          }
                        </td>


                        <td>
                          {
                            member.email || "-"
                          }
                        </td>


                        <td>
                          {
                            member.membership_status || "-"
                          }
                        </td>


                        <td>
                          {
                            member.ministry || "-"
                          }
                        </td>


<td>

  <button

    className="table-action"

    onClick={() =>
      setSelectedMember(member)
    }

  >

    View

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


      </div>


    </section>

  );

}