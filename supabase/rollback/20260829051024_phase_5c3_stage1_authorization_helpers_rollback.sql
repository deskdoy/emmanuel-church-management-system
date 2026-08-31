-- Phase 5C-3 Stage 1 rollback.
-- Legacy helpers were deliberately preserved and require no restoration.

begin;

drop function if exists private.shares_active_church_with_user(uuid, text[]);
drop function if exists private.has_active_church_membership();
drop function if exists private.has_church_role(uuid, text[]);
drop function if exists private.is_platform_owner();
drop function if exists private.is_active_church(uuid);

commit;
