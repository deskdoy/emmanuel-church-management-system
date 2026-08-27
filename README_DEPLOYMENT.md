# Production Deployment: Supabase + Vercel

This application deploys as a static React + Vite site on Vercel Free Tier. Supabase provides PostgreSQL, email/password authentication, role-based access control, and audit logging. No Express server is required.

## Step 1: Create a Supabase project

1. Sign in at [Supabase](https://supabase.com/dashboard) and create a new project.
2. Choose a strong database password and save it securely.
3. In **Project Settings → API** (or the project **Connect** dialog), copy:
   - Project URL
   - Anon key or publishable key
4. In **Authentication → Providers → Email**, keep email/password authentication enabled.
5. For production, configure a custom SMTP provider before enabling self-service signup. The built-in mail service is rate-limited and intended for testing.

Do not use the `service_role` or secret key in this frontend application.

## Step 2: Run the SQL migrations

Open **Supabase Dashboard → SQL Editor** and run these files in order:

1. `supabase/migrations/20260827041350_initial_church_management_schema.sql`
2. `supabase/migrations/20260827041433_security_policies_and_auditing.sql`
3. `supabase/migrations/20260827163002_add_payable_payment_history.sql`
4. `supabase/migrations/20260827164514_admin_only_audit_logs.sql`
5. `supabase/migrations/20260827175035_add_access_request_workflow.sql`

The migrations create all church-management tables, the six roles, reference accounts/categories, indexes, constraints, RLS policies, Auth profile synchronization, and audit triggers.

Next, create the first user in **Authentication → Users → Add user**. The trigger creates a Viewer profile automatically. Promote that one account to Admin in the SQL Editor:

```sql
update public.users
set role_id = (select id from public.roles where name = 'Admin')
where email = 'YOUR_ADMIN_EMAIL@example.com';
```

Sign out and sign back in after changing a role so the UI reloads the current permissions.

Optional CLI workflow after linking a project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## Step 3: Add environment variables

For local development, copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

For Vercel:

1. Open the Vercel project.
2. Go to **Settings → Environment Variables**.
3. Add `VITE_SUPABASE_URL` with the Supabase Project URL.
4. Add `VITE_SUPABASE_ANON_KEY` with the Supabase anon or publishable key.
5. Enable both variables for **Production**, **Preview**, and **Development** unless separate Supabase projects are used for each environment.
6. Redeploy after changing environment variables; Vite embeds `VITE_` values at build time.

These two values are safe for the browser when RLS is enabled. Never add a Supabase secret/service-role key using a `VITE_` variable.

The invitation service key belongs only to Supabase Edge Functions. Do not add it to `.env.local`, Vercel, or any `VITE_` variable.

## Step 4: Connect the GitHub repository to Vercel

1. Push this repository to GitHub, including `package-lock.json`, `.env.example`, `vercel.json`, and `supabase/migrations/`.
2. In [Vercel](https://vercel.com/new), select **Add New → Project** and import the GitHub repository.
3. Confirm these detected settings:
   - Framework Preset: **Vite**
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add the two environment variables before the first deployment.

`vercel.json` already provides the SPA rewrite so protected application paths load correctly after a direct visit or refresh.

## Step 5: Deploy

Click **Deploy**. Vercel will install pinned dependencies and run `npm run build`.

After Vercel returns the production URL:

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the Vercel production URL.
3. Add `https://YOUR_DOMAIN/?invited=true` and the required preview URLs to **Allowed Redirect URLs**.
4. In **Edge Functions → Secrets**, set `APP_URL=https://YOUR_DOMAIN`. `SUPABASE_URL`, the publishable/anon key, and the secret/service-role key are provided to hosted Supabase functions; never copy the secret into Vercel.
5. Deploy the authenticated approval function:

   ```bash
   npx supabase functions deploy manage-access-request
   ```

6. Configure production SMTP in **Authentication → SMTP Settings**. The default Supabase mailer is for testing and may only deliver to authorized project-team addresses.
7. Confirm **Email OTP Expiration** is appropriate for invitations. Expired invitation links show a dedicated message in the application; an administrator can issue a fresh invitation from **Authentication → Users** if one expires.
8. Sign in with the Admin account.
9. Verify Dashboard, Transactions, Analytics, Reports, Accounts, Payables, Access Requests, Audit Logs, CSV export, and PDF printing.
10. Submit a public access request, approve it with a final role different from the suggestion, and complete the emailed password setup flow.
11. Confirm non-Admin accounts cannot view access requests or invoke approval successfully.
12. Check `public.audit_logs` for request creation, approval/rejection, and user role assignment.

## Production checklist

- `npm run build` passes locally.
- `npm test` passes.
- Supabase migrations ran in timestamp order.
- RLS is enabled on every exposed table.
- No service-role key exists in the frontend or Vercel environment.
- The first Admin user was promoted explicitly.
- Supabase Auth Site URL matches the Vercel domain.
- Production and Preview environment variables are configured.
- A custom SMTP provider is configured before public user onboarding.
- `manage-access-request` is deployed with JWT verification enabled.
- `APP_URL` is stored as a Supabase Edge Function secret and matches an allowed Auth redirect URL.
- No public role can select, update, or delete `access_requests`.
