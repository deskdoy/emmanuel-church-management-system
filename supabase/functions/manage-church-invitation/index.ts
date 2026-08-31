import { createClient } from "npm:@supabase/supabase-js@2.112.4";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

type RequestBody = {
  action?: "send" | "accept";
  invitationId?: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const appUrl = Deno.env.get("APP_URL") || "";

function allowedOrigins() {

  const origins = [
    appUrl,
    "http://localhost:5173",
  ];

  return origins
    .map(origin => {
      try {
        return new URL(origin).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);

}

function response(
  request: Request,
  body: Record<string, unknown>,
  status = 200
) {
  const requestOrigin =
  request.headers.get("origin") || "";

const allowed =
  allowedOrigins();


return Response.json(body, {
  status,
  headers: {

    "Access-Control-Allow-Origin":
      allowed.includes(requestOrigin)
        ? requestOrigin
        : allowed[0],
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async request => {
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !allowedOrigins().length) {
    return response(
      request,
      { error: "Church invitation service is not configured." },
      503
    );
  }

  const requestOrigin = request.headers.get("origin");

  if (
  requestOrigin &&
  !allowedOrigins().includes(requestOrigin)
) {
    return response(request, { error: "Origin is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return response(request, { ok: true });
  }

  if (request.method !== "POST") {
    return response(request, { error: "Method not allowed." }, 405);
  }

  const authorization =
    request.headers.get("authorization") || "";

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return response(
      request,
      { error: "Authentication is required." },
      401
    );
  }

  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data: authData, error: authError } =
    await userClient.auth.getUser(token);

  if (authError || !authData.user) {
    return response(
      request,
      { error: "Invalid session." },
      401
    );
  }


  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return response(
      request,
      { error: "Invalid request body." },
      400
    );
  }


  if (!body.action || !body.invitationId) {
    return response(
      request,
      {
        error:
          "Action and invitation ID are required.",
      },
      400
    );
  }


  if (body.action === "send") {

    const { data: invitation, error: invitationError } =
      await userClient
        .from("church_invitations")
        .select(
          "id,email,full_name,status,expires_at,church_id"
        )
        .eq("id", body.invitationId)
        .single();


    if (invitationError || !invitation) {
      return response(
        request,
        { error: "Invitation not found." },
        404
      );
    }


    if (invitation.status !== "pending") {
      return response(
        request,
        { error: "Invitation already processed." },
        409
      );
    }


    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );


    const redirectTo =
      new URL(
        "/?invited=true",
        appUrl
      ).toString();


    const { data: invitationData, error } =
      await adminClient.auth.admin.inviteUserByEmail(
        invitation.email,
        {
          data: {
            full_name: invitation.full_name,
            church_id: invitation.church_id,
          },
          redirectTo,
        }
      );


    if (error || !invitationData.user) {
  return response(
    request,
    {
      error:
        error?.message ||
        "Unable to send invitation email.",
    },
    409
  );
}


    const { error: updateError } =
  await adminClient
    .from("church_invitations")
    .update({
      invited_user_id:
        invitationData.user.id,

      invited_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      invitation.id
    );


if (updateError) {

  return response(
    request,
    {
      error:
        updateError.message,
    },
    500
  );

}


    return response(
      request,
      {
        ok: true,
        message:
          "Church admin invitation sent.",
      }
    );
  }


  if (body.action === "accept") {

    const { error } =
      await userClient.rpc(
        "accept_church_admin_invitation",
        {
          p_invitation_id:
            body.invitationId,
        }
      );


    if (error) {
      return response(
        request,
        {
          error: error.message,
        },
        409
      );
    }


    return response(
      request,
      {
        ok: true,
        message:
          "Church invitation accepted.",
      }
    );
  }


  return response(
    request,
    { error: "Unsupported action." },
    400
  );
});