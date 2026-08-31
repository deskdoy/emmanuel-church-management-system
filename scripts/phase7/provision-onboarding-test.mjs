import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import crypto from "node:crypto";

const supabaseUrl = process.env.PHASE6_SUPABASE_URL;
const serviceKey = process.env.PHASE6_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing PHASE6_SUPABASE_URL or PHASE6_SUPABASE_SERVICE_ROLE_KEY"
  );
}

const admin = createClient(
  supabaseUrl,
  serviceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const suffix = crypto.randomBytes(4).toString("hex");

const email =
  `phase7-platform-owner-${suffix}@example.invalid`;

const password =
  `Phase7!${suffix}Secure123`;

console.log("Creating Phase 7 Platform Owner...");

const { data: authData, error: authError } =
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Phase 7 Platform Owner",
    },
  });

if (authError || !authData.user) {
  throw authError || new Error("Unable to create auth user");
}

const userId = authData.user.id;


const { data: adminRole, error: roleError } =
  await admin
    .from("platform_roles")
    .select("id")
    .eq("code", "platform_owner")
    .single();

if (roleError || !adminRole) {
  throw roleError || new Error("Platform Owner role missing");
}


await admin
  .from("users")
  .insert({
    id: userId,
    email,
    full_name: "Phase 7 Platform Owner",
    is_active: true,
  });


await admin
  .from("platform_user_roles")
  .insert({
    user_id: userId,
    platform_role_id: adminRole.id,
    is_active: true,
  });


console.log("Creating inactive Phase 7 test church...");


const { data: church, error: churchError } =
  await admin
    .from("churches")
    .insert({
      name: `Phase 7 Test Church ${suffix}`,
      slug: `phase-7-test-${suffix}`,
      address: "Phase 7 onboarding validation",
      status: "inactive",
      timezone: "Asia/Manila",
      currency: "PHP",
    })
    .select("id,name,slug")
    .single();


if (churchError || !church) {
  throw churchError || new Error("Unable to create church");
}


await admin
  .from("church_onboarding")
  .insert({
    church_id: church.id,
    stage: "draft",
  });


const runtime = {
  createdAt: new Date().toISOString(),

  platformOwner: {
    id: userId,
    email,
    password,
  },

  church: {
    id: church.id,
    name: church.name,
    slug: church.slug,
  }
};


await writeFile(
  ".phase7-runtime.json",
  JSON.stringify(runtime, null, 2)
);


console.log(
  JSON.stringify(
    {
      status: "READY",
      church: church.slug,
      platformOwner: email,
    },
    null,
    2
  )
);