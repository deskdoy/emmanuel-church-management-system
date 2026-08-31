import { supabase } from "../lib/supabase";


const client = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};


export async function loadInvitationRoles() {

  const db = client();

  const { data, error } =
    await db
      .from("roles")
      .select("id,name")
      .neq("name", "Admin")
      .order("name");


  if (error) {
    throw new Error(error.message);
  }


  return data || [];

}



type CreateInvitationInput = {
  churchId: string;
  email: string;
  fullName: string;
  roleId: string;
  invitedBy: string;
};



export async function createChurchInvitation(
  input: CreateInvitationInput
) {

  const db = client();


  const { data: invitation, error } =
    await db
      .from("church_invitations")
      .insert({

        church_id:
          input.churchId,

        email:
          input.email,

        full_name:
          input.fullName,

        role_id:
          input.roleId,

        status:
          "pending",

        invited_by:
          input.invitedBy,

        expires_at:
          new Date(
            Date.now() +
            7 * 24 * 60 * 60 * 1000
          ).toISOString(),

      })
      .select()
      .single();


  if (error) {
    throw new Error(error.message);
  }

    const {
    error: functionError,
  } = await db.functions.invoke(
  "manage-church-invitation",
  {
    body: {
      action: "send",
      invitationId: invitation.id,
    },
  }
);


if (functionError) {

  let details = "";

  try {

    if (functionError.context) {

      const body =
        await functionError.context.json();

      details =
        body.error ||
        JSON.stringify(body);

    }

  } catch {

    details =
      functionError.message;

  }


  throw new Error(
    details ||
    functionError.message
  );

}


  return invitation;

}