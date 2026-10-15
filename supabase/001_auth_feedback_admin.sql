-- ==============================================================================
-- REDE DE MÚSICA — Migração 001: contas, admin, feedback e letra do dia
-- Rode este arquivo inteiro no SQL Editor de um projeto Supabase NOVO.
-- (supabase/schema.sql é só referência para a migração futura de posts/chat;
--  não rode os dois juntos.)
-- ==============================================================================

-- ─── 1. PERFIS ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  handle      text not null unique check (handle ~ '^@[a-z0-9_.]{2,24}$'),
  avatar_url  text,
  banned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cria o perfil quando alguém se cadastra. O handle vem dos metadados do cadastro;
-- se já existir, recebe um sufixo numérico em vez de quebrar o cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  final_handle text;
  n int := 0;
begin
  base_handle := lower(coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1)));
  base_handle := regexp_replace(base_handle, '[^a-z0-9_.]', '', 'g');
  base_handle := left(coalesce(nullif(base_handle, ''), 'user'), 20);
  if char_length(base_handle) < 2 then base_handle := base_handle || '00'; end if;
  final_handle := '@' || base_handle;

  while exists (select 1 from public.profiles where handle = final_handle) loop
    n := n + 1;
    final_handle := '@' || base_handle || n::text;
  end loop;

  insert into public.profiles (id, name, handle)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 60),
    final_handle
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. ADMINS ───────────────────────────────────────────────────────────────
-- Lista de e-mails com acesso ao painel. Quem está aqui vira admin ao fazer login.
create table if not exists public.app_admins (
  email      text primary key check (email = lower(email)),
  added_at   timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins
    where email = lower(coalesce(auth.jwt()->>'email', ''))
  );
$$;

-- ─── 3. FEEDBACK ─────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category    text not null check (category in ('bug', 'sugestao', 'elogio', 'outro')),
  message     text not null check (char_length(message) between 10 and 2000),
  page        text check (char_length(page) <= 40),
  status      text not null default 'novo' check (status in ('novo', 'lido', 'resolvido')),
  admin_note  text check (char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);

-- ─── 4. LETRA DO DIA ─────────────────────────────────────────────────────────
-- Só trechos curtos (até 280 caracteres e 4 linhas), sempre com música e artista.
create table if not exists public.daily_lyrics (
  id          uuid primary key default gen_random_uuid(),
  show_on     date not null unique,
  excerpt     text not null check (
                char_length(excerpt) between 5 and 280
                and array_length(string_to_array(excerpt, E'\n'), 1) <= 4
              ),
  song        text not null check (char_length(song) between 1 and 120),
  artist      text not null check (char_length(artist) between 1 and 120),
  note        text check (char_length(note) <= 280),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── 5. updated_at automático ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists feedback_touch on public.feedback;
create trigger feedback_touch before update on public.feedback
  for each row execute function public.touch_updated_at();
drop trigger if exists daily_lyrics_touch on public.daily_lyrics;
create trigger daily_lyrics_touch before update on public.daily_lyrics
  for each row execute function public.touch_updated_at();

-- Usuário comum não pode se desbanir nem mudar o próprio id
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
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.app_admins   enable row level security;
alter table public.feedback     enable row level security;
alter table public.daily_lyrics enable row level security;

-- Perfis: leitura pública; cada um edita o seu; admin edita qualquer um (inclusive banir).
-- Apagar contas exige a service_role key (painel do Supabase → Authentication), nunca o navegador.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins: só admins veem e gerenciam a lista
drop policy if exists "admins_admin_all" on public.app_admins;
create policy "admins_admin_all" on public.app_admins for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Feedback: qualquer usuário logado e não banido envia; só admin lê, edita e apaga
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'novo'
    and admin_note is null
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned)
  );
drop policy if exists "feedback_admin_select" on public.feedback;
create policy "feedback_admin_select" on public.feedback for select to authenticated
  using (public.is_admin());
drop policy if exists "feedback_admin_update" on public.feedback;
create policy "feedback_admin_update" on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "feedback_admin_delete" on public.feedback;
create policy "feedback_admin_delete" on public.feedback for delete to authenticated
  using (public.is_admin());

-- Letra do dia: leitura pública; só admin cria, edita e apaga
drop policy if exists "lyrics_select" on public.daily_lyrics;
create policy "lyrics_select" on public.daily_lyrics for select using (true);
drop policy if exists "lyrics_admin_insert" on public.daily_lyrics;
create policy "lyrics_admin_insert" on public.daily_lyrics for insert to authenticated
  with check (public.is_admin());
drop policy if exists "lyrics_admin_update" on public.daily_lyrics;
create policy "lyrics_admin_update" on public.daily_lyrics for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "lyrics_admin_delete" on public.daily_lyrics;
create policy "lyrics_admin_delete" on public.daily_lyrics for delete to authenticated
  using (public.is_admin());

-- ─── 7. DEFINIR O ADMIN ──────────────────────────────────────────────────────
-- Troque pelo e-mail da sua conta (em minúsculas) e rode esta linha:
-- insert into public.app_admins (email) values ('seu-email@exemplo.com');
