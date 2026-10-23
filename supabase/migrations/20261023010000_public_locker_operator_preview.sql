-- AX staff can open a public locker before it's switched on (Test drive).
-- The public still gets null until athletes.metadata.public_locker.enabled.
-- Patches only the visibility clause of the live definition.
do $mig$
declare _def text;
begin
  _def := pg_get_functiondef('public.public_locker(text)'::regprocedure);
  if _def like '%AX_OPERATOR_PREVIEW%' then return; end if;
  _def := replace(_def,
    $a$where coalesce((a.metadata -> 'public_locker' ->> 'enabled')::boolean, false)$a$,
    $b$where (coalesce((a.metadata -> 'public_locker' ->> 'enabled')::boolean, false)
          or public.current_user_is_operator()) -- AX_OPERATOR_PREVIEW: staff can test-drive a closed locker$b$);
  if _def not like '%AX_OPERATOR_PREVIEW%' then raise exception 'preview patch did not apply'; end if;
  execute _def;
end
$mig$;
