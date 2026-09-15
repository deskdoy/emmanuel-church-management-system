import { FormEvent, useState } from "react";
import { MemberFamilySelect } from "./families/MemberFamilyFields";
import { supabase } from "../lib/supabase";
const client = () => {

  if (!supabase) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  return supabase;

};


type MemberFormProps = {
  churchId: string;
  userId: string;

  member?: {
    created_by: string;
    id: string;
    family_id: string | null;
    member_number: string | null;
    gender: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    baptism_date: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    birth_date: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    membership_status: string | null;
    ministry: string | null;
    notes: string | null;
  };

  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};



const membershipStatuses = [
  "Active",
  "Visitor",
  "Inactive",
  "Transferred",
  "Deceased",
];



export function MemberForm({
  churchId,
  userId,
  member,
  onSaved,
  onCancel,
}: MemberFormProps) {


  const [saving, setSaving] =
    useState(false);


  const [error, setError] =
    useState("");



  async function saveMember(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setSaving(true);
    setError("");


    const form =
      new FormData(event.currentTarget);



    const memberData = {

      church_id:
        churchId,

      // Disabled family selectors are omitted by FormData. Preserve the current
      // assignment when options are loading or unavailable.
      family_id: form.has("family_id")
        ? String(form.get("family_id") || "") || null
        : member?.family_id || null,
      member_number: String(form.get("member_number") || "").trim() || null,
      gender: String(form.get("gender") || ""),
      emergency_contact_name: String(form.get("emergency_contact_name") || ""),
      emergency_contact_phone: String(form.get("emergency_contact_phone") || ""),
      baptism_date: String(form.get("baptism_date") || "") || null,

      first_name:
        String(
          form.get("first_name") || ""
        ),

      middle_name:
        String(
          form.get("middle_name") || ""
        ),

      last_name:
        String(
          form.get("last_name") || ""
        ),

      birth_date:
        String(
          form.get("birth_date") || ""
        ) || null,

      phone:
        String(
          form.get("phone") || ""
        ),

      email:
        String(
          form.get("email") || ""
        ),

      address:
        String(
          form.get("address") || ""
        ),

      membership_status:
        String(
          form.get("membership_status") || "Active"
        ),

      ministry:
        String(
          form.get("ministry") || ""
        ),

      notes:
        String(
          form.get("notes") || ""
        ),

      created_by:
  member?.created_by || userId,

    };



    const db = client();

let error;


if (member) {

  const result =
    await db
      .from("members")
      .update(memberData)
      .eq("church_id", churchId)
      .eq(
        "id",
        member.id
      );

  error = result.error;


} else {

  const result =
    await db
      .from("members")
      .insert(memberData);

  error = result.error;

}



    if (error) {

      setError(
        error.message
      );

      setSaving(false);

      return;

    }



    await onSaved();

    setSaving(false);

  }





  return (

    <form
      className="record-form"
      onSubmit={saveMember}
    >

      <div className="form-grid">
        <MemberFamilySelect key={`${churchId}:${member?.id || "new"}`} churchId={churchId} familyId={member?.family_id || null} disabled={saving} />
        <label>
          Member Number
          <input name="member_number" defaultValue={member?.member_number || ""} />
        </label>
        <label>
          Gender
          <input name="gender" defaultValue={member?.gender || ""} />
        </label>
        <label>
          Baptism Date
          <input type="date" name="baptism_date" defaultValue={member?.baptism_date || ""} />
        </label>
        <label>
          Emergency Contact Name
          <input name="emergency_contact_name" defaultValue={member?.emergency_contact_name || ""} />
        </label>
        <label>
          Emergency Contact Phone
          <input type="tel" name="emergency_contact_phone" defaultValue={member?.emergency_contact_phone || ""} />
        </label>


        <label>
          First Name

          <input
 name="first_name"
 defaultValue={
   member?.first_name || ""
 }
 required
/>

        </label>



        <label>
          Middle Name

          <input
  name="middle_name"
  defaultValue={
    member?.middle_name || ""
  }
/>

        </label>



        <label>
          Last Name

          <input
  name="last_name"
  defaultValue={
    member?.last_name || ""
  }
  required
/>

        </label>



        <label>
          Birth Date

          <input
  type="date"
  name="birth_date"
  defaultValue={
    member?.birth_date || ""
  }
/>

        </label>




        <label>
          Phone

          <input
  name="phone"
  defaultValue={
    member?.phone || ""
  }
/>

        </label>




        <label>
          Email

          <input
  type="email"
  name="email"
  defaultValue={
    member?.email || ""
  }
/>

        </label>




        <label className="full">

          Address

          <input
  name="address"
  defaultValue={
    member?.address || ""
  }
/>

        </label>





        <label>

          Membership Status

          <select
  name="membership_status"
  defaultValue={
    member?.membership_status || "Active"
  }
>

            {
              membershipStatuses.map(
                status => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )
            }

          </select>

        </label>





        <label>

          Ministry

          <input
  name="ministry"
  defaultValue={
    member?.ministry || ""
  }
/>

        </label>




        <label className="full">

          Notes

          <textarea
  name="notes"
  rows={4}
  defaultValue={
    member?.notes || ""
  }
/>

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

          onClick={onCancel}

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
              ? "Saving..."
              : "Save Member"
          }

        </button>


      </div>


    </form>

  );

}