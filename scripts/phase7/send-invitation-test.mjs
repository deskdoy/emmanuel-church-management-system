import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const supabaseUrl = process.env.PHASE6_SUPABASE_URL;
const anonKey = process.env.PHASE6_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Missing PHASE6_SUPABASE_URL or PHASE6_SUPABASE_ANON_KEY"
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


console.log("Signing in Platform Owner...");

const { error: signInError } =
  await client.auth.signInWithPassword({
    email: runtime.platformOwner.email,
    password: runtime.platformOwner.password,
  });

assert.equal(signInError, null);

console.log("Platform Owner authenticated.");


console.log("Sending church admin invitation...");


const { data, error } =
  await client.functions.invoke(
    "manage-church-invitation",
    {
      body: {
        action: "send",
        invitationId:
          runtime.invitation.id,
      },
    }
  );


if (error) {
  const body = await error.context?.json().catch(() => null);
  console.error("Edge Function Error:", body || error.message);
  throw error;
}

assert.equal(
  data.ok,
  true
);


console.log(
  "Invitation send request completed."
);


const { data: invitation, error: invitationError } =
  await client
    .from("church_invitations")
    .select(
      "id,status,invited_user_id,email"
    )
    .eq(
      "id",
      runtime.invitation.id
    )
    .single();


assert.equal(
  invitationError,
  null
);


assert.equal(
  invitation.status,
  "pending"
);

console.log(
  "Invitation email workflow passed. Waiting for acceptance."
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      invitationId: invitation.id,
      invitedUserId:
        invitation.invited_user_id,
      email:
        invitation.email,
    },
    null,
    2
  )
);