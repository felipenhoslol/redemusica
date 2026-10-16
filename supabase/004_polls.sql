-- ═══════════════════════════════════════════════════════════════════════════
-- 004 · Votação de músicas nos posts
-- Rode depois do 003_profiles_media.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- O post guarda as opções em body.poll.options (2 a 4 músicas). Cada pessoa tem um voto
-- por post (pode trocar ou tirar). O banco confere se a opção existe naquele post.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.post_votes (
  post_id     text not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  option      smallint not null check (option between 0 and 3),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_votes_post_idx on public.post_votes (post_id);

-- A opção escolhida existe na votação daquele post?
create or replace function public.poll_option_ok(p_post text, p_option smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts
    where id = p_post
      and jsonb_typeof(body->'poll'->'options') = 'array'
      and p_option < jsonb_array_length(body->'poll'->'options')
  );
$$;

alter table public.post_votes enable row level security;

drop policy if exists "votes_select" on public.post_votes;
create policy "votes_select" on public.post_votes for select using (true);

drop policy if exists "votes_insert_own" on public.post_votes;
create policy "votes_insert_own" on public.post_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_post() and public.poll_option_ok(post_id, option));

drop policy if exists "votes_update_own" on public.post_votes;
create policy "votes_update_own" on public.post_votes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.poll_option_ok(post_id, option));

drop policy if exists "votes_delete_own" on public.post_votes;
create policy "votes_delete_own" on public.post_votes for delete to authenticated
  using (user_id = auth.uid());
