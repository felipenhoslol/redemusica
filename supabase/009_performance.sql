-- ═══════════════════════════════════════════════════════════════════════════
-- 009 · Desempenho
-- Rode depois do 008_email_verified.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- 1) O app baixa só os perfis que mudaram (updated_at). O "visto por último" e a
--    confirmação de e-mail não contam como mudança, senão todo perfil ativo seria
--    baixado de novo a cada minuto.
-- 2) Cada um pode editar o próprio comentário: o app usa isso para trocar imagens
--    antigas guardadas dentro do comentário (base64) por um link do Storage.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists email_verified_at timestamptz;
create index if not exists profiles_updated_idx on public.profiles (updated_at desc);

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'last_seen_at' - 'email_verified_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'last_seen_at' - 'email_verified_at' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- Comentários: o autor edita o próprio (só o conteúdo; post, autor e data ficam)
drop policy if exists "comments_update_own" on public.post_comments;
create policy "comments_update_own" on public.post_comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.post_id := old.post_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists post_comments_guard on public.post_comments;
create trigger post_comments_guard before update on public.post_comments
  for each row execute function public.guard_comment_update();

-- Consultas mais usadas pelo app
create index if not exists post_likes_post_idx    on public.post_likes (post_id);
create index if not exists post_reposts_post_idx  on public.post_reposts (post_id);
create index if not exists follows_follower_idx   on public.follows (follower_id);
