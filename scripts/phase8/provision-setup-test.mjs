import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import crypto from "node:crypto";

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
      autoRefreshToken: false,
    },
  }
);


const suffix =
  crypto.randomBytes(4).toString("hex");


const platformEmail =
  `phase8-platform-owner-${suffix}@example.com`;

const platformPassword =
  `Phase8!${suffix}Secure123`;


console.log(
  "Creating Phase 8 Platform Owner..."
);


const { data: authUser, error: authError } =
  await admin.auth.admin.createUser({
    email: platformEmail,
    password: platformPassword,
    email_confirm: true,
    user_metadata: {
      full_name: "Phase 8 Platform Owner",
    },
  });


if (authError || !authUser.user) {
  throw authError ||
    new Error(
      "Unable to create Platform Owner"
    );
}


const userId =
  authUser.user.id;


const { data: platformRole, error: roleError } =
  await admin
    .from("platform_roles")
    .select("id")
    .eq(
      "code",
      "platform_owner"
    )
    .single();


if (roleError || !platformRole) {
  throw roleError ||
    new Error(
      "Platform Owner role not found"
    );
}


await admin
  .from("users")
  .insert({
    id: userId,
    email: platformEmail,
    full_name: "Phase 8 Platform Owner",
    is_active: true,
  });


await admin
  .from("platform_user_roles")
  .insert({
    user_id: userId,
    platform_role_id: platformRole.id,
    is_active: true,
  });


console.log(
  "Platform Owner created:",
  platformEmail
);


console.log(
  "Creating Phase 8 test church..."
);


const churchSlug =
  `phase-8-setup-${suffix}`;


const { data: church, error: churchError } =
  await admin
    .from("churches")
    .insert({
      name:
        `Phase 8 Setup Test Church ${suffix}`,
      slug: churchSlug,
      address:
        "Phase 8 setup validation",
      status:
        "active",
      timezone:
        "Asia/Manila",
      currency:
        "PHP",
    })
    .select(
      "id,name,slug"
    )
    .single();


if (churchError || !church) {
  throw churchError ||
    new Error(
      "Unable to create church"
    );
}


console.log(
  "Creating setup progress..."
);


const { data: setup, error: setupError } =
  await admin
    .from(
      "church_setup_progress"
    )
    .insert({
      church_id:
        church.id,
    })
    .select("*")
    .single();


if (setupError) {
  throw setupError;
}


const runtime = {

  createdAt:
    new Date().toISOString(),

  platformOwner: {
    id: userId,
    email: platformEmail,
    password: platformPassword,
  },

  church: {
    id: church.id,
    name: church.name,
    slug: church.slug,
  },

};


await writeFile(
  ".phase8-runtime.json",
  JSON.stringify(
    runtime,
    null,
    2
  )
);


console.log(
  JSON.stringify(
    {
      status: "READY",
      church:
        church.slug,
      setupCompleted:
        setup.setup_completed,
    },
    null,
    2
  )
);