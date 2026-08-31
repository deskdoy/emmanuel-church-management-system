import { supabase } from "../lib/supabase";


type SetupResult = {
  success: boolean;
  message: string;
};


export async function createDefaultFinancialSetup(
  churchId: string
): Promise<SetupResult> {


  const {
    data: progress,
    error: progressError,
  } = await supabase
    .from("church_setup_progress")
    .select(
      "financial_setup_completed"
    )
    .eq(
      "church_id",
      churchId
    )
    .single();


  if (progressError) {
    throw progressError;
  }


  if (progress?.financial_setup_completed) {

    return {
      success: true,
      message: "Financial setup already completed.",
    };

  }



  // ============================
  // DEFAULT ACCOUNTS
  // ============================

  const defaultAccounts = [

    {
      name: "Cash",
      account_type: "Cash",
      opening_balance: 0,
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Bank Account",
      account_type: "Bank",
      opening_balance: 0,
      is_active: true,
      church_id: churchId,
    },

  ];



  const {
    error: accountError,
  } = await supabase
    .from("accounts")
    .upsert(
  defaultAccounts,
  {
    onConflict: "church_id,name",
  }
);


  if (accountError) {
    throw accountError;
  }





  // ============================
  // DEFAULT CATEGORIES
  // ============================

  const defaultCategories = [

    {
      name: "Tithes",
      transaction_type: "Income",
      category_group: "Income",
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Offerings",
      transaction_type: "Income",
      category_group: "Income",
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Donations",
      transaction_type: "Income",
      category_group: "Income",
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Utilities",
      transaction_type: "Expense",
      category_group: "Expense",
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Supplies",
      transaction_type: "Expense",
      category_group: "Expense",
      is_active: true,
      church_id: churchId,
    },

    {
      name: "Ministry Expenses",
      transaction_type: "Expense",
      category_group: "Expense",
      is_active: true,
      church_id: churchId,
    },

  ];



  const {
    error: categoryError,
  } = await supabase
    .from("categories")
    .upsert(
  defaultCategories,
  {
    onConflict:
      "church_id,name,transaction_type",
  }
);


  if (categoryError) {
    throw categoryError;
  }





  // ============================
  // COMPLETE SETUP
  // ============================


  const {
    error: updateError,
  } = await supabase
    .from("church_setup_progress")
    .update({
      financial_setup_completed: true,
    })
    .eq(
      "church_id",
      churchId
    );


  if (updateError) {
    throw updateError;
  }



  return {
    success: true,
    message:
      "Financial setup completed.",
  };

}

export async function completeChurchSetup(
  churchId: string
) {

  const { error } =
    await supabase
      .from("church_setup_progress")
      .update({
        team_setup_completed: true,
        setup_completed: true,
      })
      .eq(
        "church_id",
        churchId
      );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return {
    success: true,
    message:
      "Church setup completed.",
  };

}