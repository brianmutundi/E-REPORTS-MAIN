-- Close explicit API grants left on trigger/security helpers.
revoke execute on function public.my_tenant_id() from public, anon;
grant execute on function public.my_tenant_id() to authenticated;
revoke execute on function public.knec_default_levels(text) from public, anon;
grant execute on function public.knec_default_levels(text) to authenticated;
revoke execute on function public.prevent_profile_scope_change() from anon, authenticated, public;
revoke execute on function public.touch_grading_configuration() from anon, authenticated, public;
