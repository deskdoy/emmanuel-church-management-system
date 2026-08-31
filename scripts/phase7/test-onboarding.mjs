import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const env = process.env;

const supabaseUrl =
  env.PHASE6_SUPABASE_URL;

const anonKey =
  env.PHASE6_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables."
  );
}

const runtime = JSON.parse(
  await readFile(".phase7-runtime.json", "utf8")
);

const platformOwner = runtime.platformOwner;

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
    email: platformOwner.email,
    password: platformOwner.password,
  });

assert.equal(signInError, null);

console.log("Platform Owner authenticated.");

const churchSlug =
  `phase7-test-${Date.now()}`;

console.log("Creating inactive church draft...");

const { data: churchId, error: churchError } =
  await client.rpc(
    "create_platform_church_draft",
    {
      p_name: "Phase 7 Test Church",
      p_slug: churchSlug,
      p_address: "Phase 7 onboarding validation",
      p_timezone: "Asia/Manila",
      p_currency: "PHP",
    }
  );

assert.equal(churchError, null);

console.log("Church created:", churchId);

console.log("Creating first admin invitation...");

const { data: invitationId, error: invitationError } =
  await client.rpc(
    "create_church_admin_invitation",
    {
      p_church_id: churchId,
      p_full_name: "Phase 7 Test Admin",
      p_email:
  "rlac34342@gmail.com"
    }
  );

assert.equal(invitationError, null);

console.log(
  "Invitation created:",
  invitationId
);


const { data: invitation } =
  await client
    .from("church_invitations")
    .select("*")
    .eq("id", invitationId)
    .single();


assert.equal(
  invitation.status,
  "pending"
);

const { data: adminRole, error: adminRoleError } =
  await client
    .from("roles")
    .select("id")
    .eq("name", "Admin")
    .single();

assert.equal(adminRoleError, null);

assert.equal(
  invitation.role_id,
  adminRole.id
);

console.log("Invitation verification passed.");


const { data: onboarding } =
  await client
    .from("church_onboarding")
    .select("*")
    .eq("church_id", churchId)
    .single();


assert.equal(
  onboarding.stage,
  "admin_invited"
);

console.log("Onboarding verification passed.");

const phase7Runtime = {
  createdAt: new Date().toISOString(),

  platformOwner,

  church: {
    id: churchId,
  },

  invitation: {
    id: invitationId,
  },

  stage: onboarding.stage,
};


await writeFile(
  ".phase7-runtime.json",
  JSON.stringify(
    phase7Runtime,
    null,
    2
  )
);


console.log(
  JSON.stringify(
    {
      status: "PASS",
      churchId,
      invitationId,
      stage: onboarding.stage,
      runtimeSaved: true,
    },
    null,
    2
  )
);