import { supabase as supabaseClient } from "../lib/supabase";


if (!supabaseClient) {
  throw new Error(
    "Supabase client is not available."
  );
}


const supabase = supabaseClient;



export type ChurchSettings = {

  id:string;

  church_id:string;

  financial_approval_required:boolean;

};



export async function loadChurchSettings(
  churchId:string
):Promise<ChurchSettings | null>{


  const {
    data,
    error
  } =
    await supabase
      .from("church_settings")
      .select(
        `
        id,
        church_id,
        financial_approval_required
        `
      )
      .eq(
        "church_id",
        churchId
      )
      .maybeSingle();



  if(error){
    throw error;
  }


  return data;

}





export async function updateFinancialApprovalSetting(
  churchId:string,
  enabled:boolean
){


  const {
    error
  } =
    await supabase
      .from("church_settings")
      .upsert(
        {
          church_id:churchId,

          financial_approval_required:
            enabled,

        },
        {
          onConflict:
            "church_id"
        }
      );


  if(error){
    throw error;
  }


}