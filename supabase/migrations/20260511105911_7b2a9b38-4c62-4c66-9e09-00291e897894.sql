
revoke execute on function public.is_premium_or_owner(uuid) from public, anon;
grant execute on function public.is_premium_or_owner(uuid) to authenticated;
