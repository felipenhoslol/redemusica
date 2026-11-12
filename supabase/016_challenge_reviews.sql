-- ═══════════════════════════════════════════════════════════════════════════
-- 016 · Notas dadas às músicas dos desafios
-- Rode depois do 015_push.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Uma linha por (quem avaliou, dono da música, desafio, pergunta). Antes ficava só no
-- navegador; agora o perfil mostra as notas que a pessoa deu e o dono da música recebe
-- a notificação "avaliou a sua música X no desafio" (montada no app a partir destas linhas).
-- Quem está logado lê (menos contas banidas); só quem avaliou escreve.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.challenge_reviews (
  reviewer_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_id     uuid not null references public.profiles(id) on delete cascade,
  challenge_id  text not null check (char_length(challenge_id) between 1 and 80),
  question_id   text not null check (char_length(question_id) between 1 and 40),
  rating        numeric(2, 1) not null check (rating >= 0.5 and rating <= 5),
  song          jsonb check (song is null or (jsonb_typeof(song) = 'object' and pg_column_size(song) <= 4000)),
  updated_at    timestamptz not null default now(),
  primary key (reviewer_id, target_id, challenge_id, question_id)
);
create index if not exists challenge_reviews_target_idx on public.challenge_reviews (target_id, updated_at desc);
create index if not exists challenge_reviews_reviewer_idx on public.challenge_reviews (reviewer_id, updated_at desc);

alter table public.challenge_reviews enable row level security;

drop policy if exists "challenge_reviews_select" on public.challenge_reviews;
create policy "challenge_reviews_select" on public.challenge_reviews for select to authenticated
  using (public.author_visible(reviewer_id));

drop policy if exists "challenge_reviews_insert_own" on public.challenge_reviews;
create policy "challenge_reviews_insert_own" on public.challenge_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and public.can_post());

drop policy if exists "challenge_reviews_update_own" on public.challenge_reviews;
create policy "challenge_reviews_update_own" on public.challenge_reviews for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid() and public.can_post());

drop policy if exists "challenge_reviews_delete_own" on public.challenge_reviews;
create policy "challenge_reviews_delete_own" on public.challenge_reviews for delete to authenticated
  using (reviewer_id = auth.uid());
