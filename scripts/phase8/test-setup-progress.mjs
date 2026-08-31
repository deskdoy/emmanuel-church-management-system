import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const supabaseUrl =
  process.env.PHASE6_SUPABASE_URL;

const anonKey =
  process.env.PHASE6_SUPABASE_ANON_KEY;


if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Missing Supabase environment variables"
  );
}


const runtime = JSON.parse(
  await readFile(
    ".phase8-runtime.json",
    "utf8"
  )
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


// ---------------------------------------------
// Login Phase 8 Platform Owner
// ---------------------------------------------

console.log(
  "Signing in Phase 8 Platform Owner..."
);


const { error: loginError } =
  await client.auth.signInWithPassword({
    email:
      runtime.platformOwner.email,

    password:
      runtime.platformOwner.password,
  });


assert.equal(
  loginError,
  null
);


console.log(
  "Platform Owner authenticated."
);


// ---------------------------------------------
// Verify Emmanuel Church setup
// ---------------------------------------------

console.log(
  "Checking Emmanuel Church setup..."
);


const { data: emmanuelChurch, error: emmanuelError } =
  await client
    .from("churches")
    .select("id,name,slug")
    .eq(
      "slug",
      "emmanuel-church"
    )
    .single();


assert.equal(
  emmanuelError,
  null
);


const { data: emmanuelSetup, error: emmanuelSetupError } =
  await client
    .from("church_setup_progress")
    .select("*")
    .eq(
      "church_id",
      emmanuelChurch.id
    )
    .single();


assert.equal(
  emmanuelSetupError,
  null
);


assert.equal(
  emmanuelSetup.setup_completed,
  true
);


console.log(
  "Emmanuel Church setup verified."
);


// ---------------------------------------------
// Verify new church setup
// ---------------------------------------------

console.log(
  "Checking Phase 8 test church setup..."
);


const { data: newChurchSetup, error: newSetupError } =
  await client
    .from("church_setup_progress")
    .select("*")
    .eq(
      "church_id",
      runtime.church.id
    )
    .single();


assert.equal(
  newSetupError,
  null
);


assert.equal(
  newChurchSetup.profile_completed,
  false
);

assert.equal(
  newChurchSetup.financial_setup_completed,
  false
);

assert.equal(
  newChurchSetup.team_setup_completed,
  false
);

assert.equal(
  newChurchSetup.setup_completed,
  false
);


console.log(
  JSON.stringify(
    {
      status: "PASS",

      emmanuel:
        {
          setupCompleted:
            emmanuelSetup.setup_completed,
        },

      newChurch:
        {
          setupCompleted:
            newChurchSetup.setup_completed,
        },

    },
    null,
    2
  )
);