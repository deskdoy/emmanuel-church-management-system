import { createClient } from "npm:@supabase/supabase-js@2.112.4";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

const roleNames = ["Admin", "Pastor", "Treasurer", "Secretary", "Encoder", "Viewer"] as const;
type RoleName = typeof roleNames[number];
type RequestBody = { action?: "approve" | "reject"; requestId?: string; approvedRole?: RoleName };

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const appUrl = Deno.env.get("APP_URL") || "";

function allowedOrigin() {
  try { return new URL(appUrl).origin; } catch { return ""; }
}

function response(request: Request, body: Record<string, unknown>, status = 200) {
  const origin = request.headers.get("origin") || allowedOrigin();
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin === allowedOrigin() ? origin : allowedOrigin(),
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function relationName(value: unknown) {
  const role = Array.isArray(value) ? value[0] : value;
  return String((role as { name?: unknown } | null)?.name || "");
}

Deno.serve(async request => {
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !allowedOrigin()) {
    return response(request, { error: "Access request service is not configured." }, 503);
  }
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== allowedOrigin()) return response(request, { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return response(request, { ok: true });
  if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return response(request, { error: "Authentication is required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return response(request, { error: "Your session is invalid or expired." }, 401);

  const { data: profile, error: profileError } = await userClient.from("users")
    .select("id,is_active,roles(name)").eq("id", authData.user.id).single();
  if (profileError || !profile?.is_active || relationName(profile.roles) !== "Admin") {
    return response(request, { error: "Only an active Admin can process access requests." }, 403);
  }

  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return response(request, { error: "Invalid request body." }, 400); }
  if (!body.requestId || !body.action) return response(request, { error: "Request ID and action are required." }, 400);

  const { data: accessRequest, error: requestError } = await userClient.from("access_requests")
    .select("id,full_name,email,status").eq("id", body.requestId).single();
  if (requestError || !accessRequest) return response(request, { error: "Access request was not found." }, 404);
  if (accessRequest.status !== "Pending") return response(request, { error: "This access request has already been processed." }, 409);

  if (body.action === "reject") {
    const { error } = await userClient.rpc("reject_access_request", { p_request_id: accessRequest.id });
    if (error) return response(request, { error: "The request could not be rejected. Please refresh and try again." }, 409);
    return response(request, { ok: true, message: "Access request rejected." });
  }

  if (!body.approvedRole || !roleNames.includes(body.approvedRole)) {
    return response(request, { error: "Select a valid final role before approving." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const redirectTo = new URL("/?invited=true", appUrl).toString();
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(accessRequest.email, {
    data: { full_name: accessRequest.full_name },
    redirectTo,
  });
  if (invitationError || !invitation.user) {
    const alreadyExists = /already|registered|exists/i.test(invitationError?.message || "");
    return response(request, {
      error: alreadyExists
        ? "An Auth account already exists for this email. Review that account before retrying."
        : "Supabase could not send the invitation. Confirm SMTP and redirect settings, then retry.",
    }, 409);
  }

  const { error: finalizationError } = await userClient.rpc("finalize_access_request", {
    p_request_id: accessRequest.id,
    p_invited_user_id: invitation.user.id,
    p_approved_role: body.approvedRole,
  });
  if (finalizationError) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    return response(request, { error: "The invitation was rolled back because approval could not be finalized. Please retry." }, 409);
  }

  return response(request, { ok: true, message: "Request approved and invitation email sent." });
});
