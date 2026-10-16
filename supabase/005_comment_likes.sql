-- ═══════════════════════════════════════════════════════════════════════════
-- 005 · Curtidas em comentários
-- Rode depois do 004_polls.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Cada pessoa curte um comentário uma vez (pode descurtir). Comentário apagado leva
-- as curtidas junto. As notificações de "curtiu seu comentário" saem daqui.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.comment_likes (
  comment_id  text not null references public.post_comments(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select" on public.comment_likes;
create policy "comment_likes_select" on public.comment_likes for select using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());
