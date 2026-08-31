import { createClient } from "@supabase/supabase-js";

const url = process.env.PHASE6_SUPABASE_URL;
const serviceKey = process.env.PHASE6_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Missing staging environment variables.");
}

const supabase = createClient(url, serviceKey);

const email = "staging.admin@faithfulsteward.test";
const password = "TempPassword123!";

console.log("Creating staging admin...");

const { data: created, error: createError } =
  await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

if (createError) {
  throw createError;
}

const userId = created.user.id;

console.log("Auth user created:", userId);

const { data: adminRole, error: roleError } =
  await supabase
    .from("roles")
    .select("id")
    .eq("name", "Admin")
    .single();

if (roleError) {
  throw roleError;
}

const { error: profileError } =
  await supabase
    .from("users")
    .insert({
      id: userId,
      email,
      full_name: "Faithful Steward Staging Admin",
      role_id: adminRole.id,
      is_active: true,
    });

if (profileError) {
  throw profileError;
}

console.log("Staging admin created successfully.");
console.log(email);