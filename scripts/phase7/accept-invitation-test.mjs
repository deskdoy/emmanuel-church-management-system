import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const supabaseUrl = process.env.PHASE6_SUPABASE_URL;
const anonKey = process.env.PHASE6_SUPABASE_ANON_KEY;

const serviceRoleKey =
  process.env.PHASE6_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase environment variables"
  );
}

const runtime = JSON.parse(
  await readFile(".phase7-runtime.json", "utf8")
);

const client = createClient(
  supabaseUrl,
  anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const admin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


// --------------------------------------------------
// Create invited user account
// --------------------------------------------------

const invitedEmail =
  runtime.invitation.email || "rlac34342@gmail.com";

const invitedPassword =
  "Phase7Admin!12345";


console.log("Finding invited admin account...");

const { data: usersData, error: usersError } =
  await admin.auth.admin.listUsers();

if (usersError) {
  throw usersError;
}

const existingUser =
  usersData.users.find(
    user => user.email === invitedEmail
  );

if (!existingUser) {
  throw new Error(
    "Invited user was not found in Auth."
  );
}

const invitedUserId = existingUser.id;

console.log(
  "Setting invited admin password..."
);

const { error: passwordError } =
  await admin.auth.admin.updateUserById(
    invitedUserId,
    {
      password: invitedPassword,
      email_confirm: true,
    }
  );

if (passwordError) {
  throw passwordError;
}

console.log(
  "Password configured."
);

console.log(
  "Invited user found:",
  invitedUserId
);


console.log(
  "Invited user created:",
  invitedUserId
);


// --------------------------------------------------
// Login invited user
// --------------------------------------------------

console.log("Signing in invited admin...");


const { error: loginError } =
  await client.auth.signInWithPassword({
    email: invitedEmail,
    password: invitedPassword,
  });


assert.equal(
  loginError,
  null
);


console.log(
  "Invited admin authenticated."
);


// --------------------------------------------------
// Accept invitation
// --------------------------------------------------

console.log(
  "Accepting invitation..."
);


const { error: acceptError } =
  await client.rpc(
    "accept_church_admin_invitation",
    {
      p_invitation_id:
        runtime.invitation.id,
    }
  );


if (acceptError) {
  console.error("ACCEPT ERROR:", acceptError);
  throw acceptError;
}


console.log(
  "Invitation accepted."
);


// --------------------------------------------------
// Verify invitation
// --------------------------------------------------

const { data: invitation } =
  await client
    .from("church_invitations")
    .select("*")
    .eq(
      "id",
      runtime.invitation.id
    )
    .single();


assert.equal(
  invitation.status,
  "accepted"
);


assert.equal(
  invitation.invited_user_id,
  invitedUserId
);


// --------------------------------------------------
// Verify membership
// --------------------------------------------------

const { data: membership } =
  await client
    .from("church_memberships")
    .select("*")
    .eq(
      "church_id",
      runtime.church.id
    )
    .eq(
      "user_id",
      invitedUserId
    )
    .single();


assert.equal(
  membership.status,
  "active"
);


// --------------------------------------------------
// Verify onboarding
// --------------------------------------------------

const { data: onboarding } =
  await client
    .from("church_onboarding")
    .select("*")
    .eq(
      "church_id",
      runtime.church.id
    )
    .single();


assert.equal(
  onboarding.stage,
  "admin_accepted"
);


console.log(
  JSON.stringify(
    {
      status: "PASS",
      invitedUserId,
      membershipStatus:
        membership.status,
      onboardingStage:
        onboarding.stage,
    },
    null,
    2
  )
);