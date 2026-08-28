# Safe Admin Test-Data Cleanup

Use this procedure only after deployment validation and only with an authorized database administrator. Emmanuel Cash Flow intentionally provides no one-click delete button.

## Required safeguards

1. Generate and download relevant backups from **Backup Center** before cleanup.
2. Record the Export ID in the change ticket or cleanup notes.
3. Identify test records by explicit IDs. Never use a broad, date-only delete condition.
4. Review dependencies and remove child test records before their parent records.
5. Run the work inside a transaction and inspect the affected rows before deciding whether to commit.

Never delete roles, the Admin account, categories, accounts, or audit logs. Do not delete users to remove access; deactivate the user in the Users module so financial history stays connected.

## Recommended order

Review and target only confirmed test IDs in this order:

1. Payable payments, then payables
2. Account transfers
3. Offerings, donations, and expenses
4. Test projects after confirming no remaining linked donations or expenses
5. Non-financial test records, when applicable

## Transaction review pattern

Use the Supabase SQL Editor with explicit UUIDs. The following pattern deliberately ends with `rollback` so a first pass cannot make permanent changes:

```sql
begin;

-- Preview the exact test records first.
select id, payment_date, amount
from public.payable_payments
where id in ('REPLACE_WITH_CONFIRMED_TEST_UUID');

-- After a second review, add only explicit-ID cleanup statements here.
-- Keep the first run as a rollback and verify the reported row counts.

rollback;
```

For the final approved run, have a second administrator re-check the backup, explicit IDs, dependency order, and protected-record list before changing `rollback` to `commit`. Retain the Export ID and cleanup approval with operational records.
