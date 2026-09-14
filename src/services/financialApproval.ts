import { supabase as supabaseClient } from "../lib/supabase";


if (!supabaseClient) {
  throw new Error(
    "Supabase client is not available."
  );
}


const supabase = supabaseClient;



export type PendingExpense = {

  id:string;

  expenseDate:string;

  vendor:string;

  description:string;

  amount:number;

  paymentMethod:string;

  reference:string;

  notes:string;

  approvalStatus:string;

  recordedBy:string|null;

  approvedBy:string|null;

  approvedAt:string|null;

  rejectedBy:string|null;

  rejectedAt:string|null;

  rejectionReason:string|null;

  createdAt:string;

};



export async function loadPendingExpenses(
  churchId:string
):Promise<PendingExpense[]> {


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        `
        id,
        expense_date,
        vendor,
        description,
        amount,
        payment_method,
        reference,
        notes,
        approval_status,
        recorded_by,
        approved_by,
        approved_at,
        rejected_by,
        rejected_at,
        rejection_reason,
        created_at
        `
      )
      .eq(
        "church_id",
        churchId
      )
      .eq(
        "approval_status",
        "pending"
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      );


  if(error){
    throw error;
  }


  return (data || []).map(
    row => ({

      id:row.id,

      expenseDate:
        row.expense_date,

      vendor:
        row.vendor,

      description:
        row.description,

      amount:
        Number(row.amount) || 0,

      paymentMethod:
        row.payment_method,

      reference:
        row.reference,

      notes:
        row.notes,

      approvalStatus:
        row.approval_status,

      recordedBy:
        row.recorded_by,

      approvedBy:
        row.approved_by,

      approvedAt:
        row.approved_at,

      rejectedBy:
        row.rejected_by,

      rejectedAt:
        row.rejected_at,

      rejectionReason:
        row.rejection_reason,

      createdAt:
        row.created_at

    })
  );

}




export async function approveExpense(
  churchId:string,
  expenseId:string,
  userId:string
){

  const {
    error
  } =
    await supabase
      .from("expenses")
      .update({

        approval_status:
          "approved",

        approved_by:
          userId,

        approved_at:
          new Date().toISOString(),

        rejected_by:
          null,

        rejected_at:
          null,

        rejection_reason:
          null

      })
      .eq(
        "id",
        expenseId
      )
      .eq(
        "church_id",
        churchId
      );


  if(error){
    throw error;
  }

}





export async function rejectExpense(
  churchId:string,
  expenseId:string,
  userId:string,
  reason:string
){

  const {
    error
  } =
    await supabase
      .from("expenses")
      .update({

        approval_status:
          "rejected",

        rejected_by:
          userId,

        rejected_at:
          new Date().toISOString(),

        rejection_reason:
          reason

      })
      .eq(
        "id",
        expenseId
      )
      .eq(
        "church_id",
        churchId
      );


  if(error){
    throw error;
  }

}