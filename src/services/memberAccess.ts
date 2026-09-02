import {
  createChurchInvitation,
} from "./invitations";


type InviteMemberInput = {

  churchId: string;

  memberId: string;

  memberName: string;

  memberEmail: string;

  roleId: string;

  invitedBy: string;

};



export async function inviteMemberAsUser(
  input: InviteMemberInput
) {


  if (!input.memberEmail.trim()) {

    throw new Error(
      "Member email is required before sending an invitation."
    );

  }



  return await createChurchInvitation({

    churchId:
      input.churchId,


    email:
      input.memberEmail,


    fullName:
      input.memberName,


    roleId:
      input.roleId,


    invitedBy:
      input.invitedBy,

  });


}