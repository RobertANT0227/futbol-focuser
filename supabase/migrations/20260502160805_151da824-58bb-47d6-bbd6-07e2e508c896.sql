-- fix search_path
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

-- revoke direct execute from public/anon/authenticated
revoke execute on function public.is_account_active(uuid) from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS policies still work because they execute as definer in postgres role context
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_account_active(uuid) to authenticated;