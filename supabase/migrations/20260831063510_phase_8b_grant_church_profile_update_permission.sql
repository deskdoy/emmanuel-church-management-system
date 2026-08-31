begin;


grant select, update
on public.churches
to authenticated;


commit;