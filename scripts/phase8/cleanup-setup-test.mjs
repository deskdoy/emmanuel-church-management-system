import { createClient } from "@supabase/supabase-js";


const supabaseUrl =
  process.env.PHASE6_SUPABASE_URL;


const serviceRoleKey =
  process.env.PHASE6_SUPABASE_SERVICE_ROLE_KEY;


if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase environment variables"
  );
}


const admin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
    },
  }
);


console.log(
  "Finding Phase 8 test churches..."
);


const {
  data: churches,
  error: churchError,
} =
  await admin
    .from("churches")
    .select("id,name,slug")
    .like(
      "slug",
      "phase-8-setup-%"
    );


if (churchError) {
  throw churchError;
}


if (!churches.length) {

  console.log(
    "No Phase 8 test churches found."
  );

  process.exit(0);

}



for (const church of churches) {

  console.log(
    "Cleaning:",
    church.name
  );


  // Remove setup progress

  await admin
    .from("church_setup_progress")
    .delete()
    .eq(
      "church_id",
      church.id
    );


  // Remove categories

  await admin
    .from("categories")
    .delete()
    .eq(
      "church_id",
      church.id
    );


  // Remove accounts

  await admin
    .from("accounts")
    .delete()
    .eq(
      "church_id",
      church.id
    );


  // Find memberships

  const {
    data: memberships,
  } =
    await admin
      .from("church_memberships")
      .select("user_id")
      .eq(
        "church_id",
        church.id
      );


  // Remove memberships

  await admin
    .from("church_memberships")
    .delete()
    .eq(
      "church_id",
      church.id
    );


  // Remove dependent tenant records first

const tables = [
  "church_invitations",
  "church_onboarding",
  "church_setup_progress",
  "accounts",
  "categories",
  "donations",
  "offerings",
  "expenses",
  "payables",
  "payable_payments",
  "account_transfers",
  "projects",
  "events",
  "announcements",
  "attendance",
  "members",
  "reports",
  "access_requests",
  "audit_logs",
  "church_memberships",
];


for (const table of tables) {

  const { error } = await admin
    .from(table)
    .delete()
    .eq(
      "church_id",
      church.id
    );


  if (error) {

    console.log(
      `Failed deleting ${table}:`,
      error.message
    );

  }

}


// Remove church last

const { error: deleteChurchError } =
  await admin
    .from("churches")
    .delete()
    .eq(
      "id",
      church.id
    );


if (deleteChurchError) {

  console.log(
    "Failed deleting church:",
    deleteChurchError.message
  );

}


  // Remove test auth users

  for (const member of memberships || []) {

    await admin.auth.admin.deleteUser(
      member.user_id
    );

  }


}


console.log(
  "Phase 8 cleanup completed."
);