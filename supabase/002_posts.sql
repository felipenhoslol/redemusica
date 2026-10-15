-- ═══════════════════════════════════════════════════════════════════════════
-- 002 · Posts compartilhados: posts, curtidas, reposts, comentários e seguidores
-- Rode depois do 001_auth_feedback_admin.sql, no SQL Editor do Supabase.
-- Pode rodar de novo sem problema (idempotente).
-- ═══════════════════════════════════════════════════════════════════════════

-- Quem está logado e não foi banido pode publicar
create or replace function public.can_post()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and banned);
$$;

-- Autores banidos somem do feed de todo mundo
create or replace function public.author_visible(author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where id = author and banned);
$$;

-- ─── POSTS ──────────────────────────────────────────────────────────────────
-- O conteúdo (texto, letra, música, imagem, playlist) fica em body (jsonb).
-- Imagens chegam já comprimidas pelo app; o limite de tamanho barra abusos.
create table if not exists public.posts (
  id          text primary key check (id ~ '^post_[A-Za-z0-9_]{4,60}$'),
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body        jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 700000),
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ─── CURTIDAS E REPOSTS ─────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id     text not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_reposts (
  post_id     text not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ─── COMENTÁRIOS ────────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id          text primary key check (id ~ '^c_[A-Za-z0-9_]{4,60}$'),
  post_id     text not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body        jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 700000),
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

-- ─── SEGUIDORES ─────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_reposts  enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows       enable row level security;

-- Posts: todo mundo lê; cada um cria, edita e apaga os seus; admin apaga qualquer um
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts for select using (public.author_visible(author_id));
drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.can_post());
drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.can_post());
drop policy if exists "posts_delete_own_or_admin" on public.posts;
create policy "posts_delete_own_or_admin" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Curtidas e reposts: todo mundo lê; cada um marca e desmarca os seus
drop policy if exists "likes_select" on public.post_likes;
create policy "likes_select" on public.post_likes for select using (true);
drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());
drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own" on public.post_likes for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "reposts_select" on public.post_reposts;
create policy "reposts_select" on public.post_reposts for select using (true);
drop policy if exists "reposts_insert_own" on public.post_reposts;
create policy "reposts_insert_own" on public.post_reposts for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());
drop policy if exists "reposts_delete_own" on public.post_reposts;
create policy "reposts_delete_own" on public.post_reposts for delete to authenticated
  using (user_id = auth.uid());

-- Comentários: todo mundo lê; apaga quem comentou, o dono do post ou um admin
drop policy if exists "comments_select" on public.post_comments;
create policy "comments_select" on public.post_comments for select using (public.author_visible(user_id));
drop policy if exists "comments_insert_own" on public.post_comments;
create policy "comments_insert_own" on public.post_comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());
drop policy if exists "comments_delete" on public.post_comments;
create policy "comments_delete" on public.post_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- Seguidores: todo mundo vê; cada um segue e deixa de seguir por si
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows for select using (true);
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and public.can_post());
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete to authenticated
  using (follower_id = auth.uid());
