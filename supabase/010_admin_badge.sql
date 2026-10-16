-- ═══════════════════════════════════════════════════════════════════════════
-- 010 · Engrenagem de admin nos perfis
-- Rode depois do 009_performance.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- A lista de admins (app_admins) guarda e-mails e só admins leem. Esta função devolve
-- apenas os ids de perfil de quem é admin (nada de e-mail), para o app mostrar a
-- engrenagem ao lado do nome.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
    join public.app_admins a on a.email = lower(u.email);
$$;

revoke all on function public.admin_profile_ids() from public;
grant execute on function public.admin_profile_ids() to anon, authenticated;
