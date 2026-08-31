# Phase 6 isolated multi-church verification

Phase 6 fixtures must run only against a disposable local Supabase stack, a preview branch, or a staging project. The production project reference `jwhycucpvgejschyqwnq` is hard-denied by every fixture runner and by the Playwright configuration.

## Safety boundary

- Never put Phase 6 fixture data in `supabase/migrations`.
- Never prefix a service-role key with `VITE_` or expose it to browser code.
- Do not use the production URL, project reference, anon key, or service-role key in `.env.phase6.local`.
- The target must contain the current Faithful Steward schema and only the Emmanuel tenant before provisioning.
- Use a disposable target. Deleting the preview branch or local database remains the final containment control.

## Prepare an isolated target

1. Start a disposable local Supabase stack, or create a preview/staging environment containing the current schema.
2. Copy `.env.phase6.example` to `.env.phase6.local`.
3. Fill in the non-production URL, anon key, service-role key, and exact project reference.
4. Set `PHASE6_CONFIRM=PHASE6_ISOLATED_TEST_ONLY`.
5. Confirm the URL-derived project reference is not `jwhycucpvgejschyqwnq`.

Install the pinned Chromium runtime once with `PLAYWRIGHT_BROWSERS_PATH` pointed at `.phase6/ms-playwright`. The repository configuration uses that gitignored location automatically during tests.

The service-role key is read only by Node fixture and cleanup processes. Vite receives only the public URL and anon key.

## Run the test cycle

```text
npm run phase6:provision
npm run phase6:isolation
npm run phase6:e2e
npm run phase6:cleanup
npm run phase6:verify
```

`phase6:provision` creates uniquely prefixed test identities, two tenant data sets, and a temporary `Phase 6 Demo Church`. It stores the exact IDs and random test passwords in the gitignored `.phase6/runtime.json` file.

`phase6:isolation` validates tenant reads and writes, composite tenant integrity, Platform Owner restrictions, church-role permissions, access-request isolation, audit isolation, and tenant financial controls.

`phase6:e2e` starts Vite with the isolated public Supabase credentials. It verifies desktop and mobile switching, tenant-specific ledgers, role-specific UI actions, Platform Owner behavior, and the no-membership gate.

`phase6:cleanup` deletes only records identified by the guarded runtime manifest, removes the temporary Auth identities, removes their audit residue, and deletes the exact Demo Church. It refuses cleanup if the expected Demo slug and ID do not match.

`phase6:verify` independently confirms that only Emmanuel remains and that there are no Demo rows, memberships, platform assignments, profiles, Auth identities, or audit residue.

## Expected result

- Emmanuel users cannot read or mutate Demo Church records.
- Demo Church users cannot read or mutate Emmanuel records.
- The multi-church fixture user switches between Viewer and Treasurer permissions.
- Platform Owner receives no church financial access without a membership.
- Money transfers change account balances but do not enter income or expense controls.
- Cleanup returns the isolated target to its one-church starting condition.

Reports and retained-on-failure browser artifacts are written under `.phase6/` and are never committed.

## Emergency cleanup

If a test fails after provisioning, run `npm run phase6:cleanup` before investigating. If cleanup cannot complete, destroy or reset the disposable preview/local environment. Never redirect the cleanup command to production.
