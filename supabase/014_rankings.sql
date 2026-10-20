-- ═══════════════════════════════════════════════════════════════════════════
-- 014 · Ranking por estrelas (artista e álbum)
-- Rode depois do 013_security.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Cada pessoa tem um ranking por artista ou álbum (key = 'artist:<id>' ou 'album:<id>'),
-- salvo enquanto dá as notas. Quem está logado lê (menos rankings de contas banidas); só o dono escreve.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.star_rankings (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  key         text not null check (key ~ '^(artist|album):[A-Za-z0-9_-]{1,40}$'),
  body        jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 200000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.star_rankings enable row level security;

drop policy if exists "star_rankings_select" on public.star_rankings;
create policy "star_rankings_select" on public.star_rankings for select to authenticated using (public.author_visible(user_id));

drop policy if exists "star_rankings_insert_own" on public.star_rankings;
create policy "star_rankings_insert_own" on public.star_rankings for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());

drop policy if exists "star_rankings_update_own" on public.star_rankings;
create policy "star_rankings_update_own" on public.star_rankings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_post());

drop policy if exists "star_rankings_delete_own" on public.star_rankings;
create policy "star_rankings_delete_own" on public.star_rankings for delete to authenticated
  using (user_id = auth.uid());
