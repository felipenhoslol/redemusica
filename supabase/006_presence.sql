-- ═══════════════════════════════════════════════════════════════════════════
-- 006 · Online / offline
-- Rode depois do 005_comment_likes.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Enquanto o site está aberto, o app avisa "estou aqui" a cada minuto (touch_presence).
-- Quem avisou nos últimos ~2 minutos aparece como online; os outros, "visto há X".
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc);

-- Só marca o próprio perfil e só com o horário do servidor (ninguém finge estar online por outro)
create or replace function public.touch_presence()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid() and not banned;
$$;

revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- O próprio usuário não escreve last_seen_at direto no update do perfil: só via touch_presence
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.banned := old.banned;
  end if;
  new.id := old.id;
  -- touch_presence roda como dono (postgres); qualquer outro update mantém o valor antigo
  if current_user <> 'postgres' then
    new.last_seen_at := old.last_seen_at;
  end if;
  return new;
end;
$$;
