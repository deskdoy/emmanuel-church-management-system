import { supabase } from "../lib/supabase";


const client = () => {

  if (!supabase) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  return supabase;

};



export type MemberAccessStatus = {

  status:
    | "none"
    | "pending"
    | "active";

  role?: string;

};




export async function loadMemberAccessStatus(
  churchId: string,
  email: string
): Promise<MemberAccessStatus> {


  const db = client();


  if (!email) {

    return {
      status: "none",
    };

  }



  // Check pending invitation first

  const {
    data: invitation,
    error: invitationError,
  } =
    await db
      .from("church_invitations")
      .select(
        `
        status,
        role_id
        `
      )
      .eq(
        "church_id",
        churchId
      )
      .eq(
        "email",
        email
      )
      .eq(
        "status",
        "pending"
      )
      .maybeSingle();



  if (!invitationError && invitation) {


    const {
      data: role,
    } =
      await db
        .from("roles")
        .select("name")
        .eq(
          "id",
          invitation.role_id
        )
        .maybeSingle();



    return {

      status:
        "pending",

      role:
        role?.name,

    };

  }





  // Check active user access

  const {
    data: membership,
    error: membershipError,
  } =
    await db
      .from("church_memberships")
      .select(
        `
        role_id
        `
      )
      .eq(
        "church_id",
        churchId
      )
      .eq(
        "email",
        email
      )
      .maybeSingle();



  if (!membershipError && membership) {


    const {
      data: role,
    } =
      await db
        .from("roles")
        .select("name")
        .eq(
          "id",
          membership.role_id
        )
        .maybeSingle();



    return {

      status:
        "active",

      role:
        role?.name,

    };

  }




  return {

    status:
      "none",

  };

}