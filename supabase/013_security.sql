-- ═══════════════════════════════════════════════════════════════════════════
-- 013 · Segurança
-- Rode no SQL Editor do Supabase (de preferência depois do 012). Pode rodar de novo.
--
-- 1) Admin preso à CONTA, não ao e-mail. Com "Confirm email" desligado (008), um e-mail
--    da lista de admins que ainda não tinha conta podia ser cadastrado por qualquer um,
--    sem confirmar, e virar admin. Agora cada admin fica ligado ao id da conta que já
--    existia quando foi adicionado; e-mail sem conta é recusado.
-- 2) Perfis, posts, comentários, curtidas, votos e seguidores só para quem está logado
--    (antes qualquer um com a chave pública do site baixava tudo sem ter conta).
--    O cadastro confere se o @ está livre por uma função que só responde sim/não.
-- 3) Datas e autoria definidas pelo servidor: ninguém cria post "no futuro" para ficar
--    no topo do feed, nem troca autor/data numa edição, nem marca "visto" por outra pessoa.
-- 4) Fotos: cada um só lista os arquivos da própria pasta (as fotos continuam públicas
--    pelo link, como antes).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. ADMIN PELA CONTA ────────────────────────────────────────────────────
alter table public.app_admins add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists app_admins_user_idx on public.app_admins (user_id);

-- Quem já é admin hoje continua admin: liga cada e-mail da lista à conta atual dele
-- (sem o gatilho abaixo durante a ligação, para funcionar também ao rodar de novo)
drop trigger if exists app_admins_bind on public.app_admins;
update public.app_admins a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and lower(u.email) = a.email;

create or replace function public.bind_admin_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  new.email := lower(trim(new.email));
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    new.user_id := old.user_id;
    return new;
  end if;
  select u.id into account from auth.users u where lower(u.email) = new.email limit 1;
  if account is null then
    raise exception 'Não existe conta com esse e-mail. Peça para a pessoa se cadastrar primeiro e tente de novo.';
  end if;
  new.user_id := account;
  return new;
end;
$$;

drop trigger if exists app_admins_bind on public.app_admins;
create trigger app_admins_bind before insert or update on public.app_admins
  for each row execute function public.bind_admin_account();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.admin_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.app_admins where user_id is not null;
$$;

revoke all on function public.admin_profile_ids() from public, anon;
grant execute on function public.admin_profile_ids() to authenticated;

-- ─── 2. LEITURA SÓ PARA QUEM ESTÁ LOGADO ────────────────────────────────────
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('profiles',      'profiles_select',      'true'),
      ('posts',         'posts_select',         'public.author_visible(author_id)'),
      ('post_likes',    'likes_select',         'true'),
      ('post_reposts',  'reposts_select',       'true'),
      ('post_comments', 'comments_select',      'public.author_visible(user_id)'),
      ('follows',       'follows_select',       'true'),
      ('post_votes',    'votes_select',         'true'),
      ('comment_likes', 'comment_likes_select', 'true')
    ) as v(tbl, pol, cond)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
      execute format('create policy %I on public.%I for select to authenticated using (%s)', t.pol, t.tbl, t.cond);
    end if;
  end loop;
end $$;

-- O cadastro (ainda sem login) só pergunta se o @ está livre
create or replace function public.handle_available(p_handle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where handle = lower(trim(p_handle)));
$$;

revoke all on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to anon, authenticated;

-- ─── 3. DATAS E AUTORIA PELO SERVIDOR ───────────────────────────────────────
create or replace function public.force_created_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['posts', 'post_comments', 'messages', 'post_likes', 'post_reposts',
                           'follows', 'post_votes', 'comment_likes']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_created_now', t);
      execute format('create trigger %I before insert on public.%I for each row execute function public.force_created_now()',
                     t || '_created_now', t);
    end if;
  end loop;
end $$;

-- Editar um post muda só o conteúdo: id, autor e data ficam
create or replace function public.guard_post_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before update on public.posts
  for each row execute function public.guard_post_update();

-- Mensagem editada: só o conteúdo; o "visto" só muda por mark_messages_read (quem recebeu)
do $$
begin
  if to_regclass('public.messages') is not null then
    alter table public.messages add column if not exists read_at timestamptz;
  end if;
end $$;

create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.from_id := old.from_id;
  new.to_id := old.to_id;
  new.created_at := old.created_at;
  -- mark_messages_read roda como dono (postgres); quem enviou não marca "visto" sozinho
  if current_user <> 'postgres' then
    new.read_at := old.read_at;
  end if;
  return new;
end;
$$;

-- Perfil: ninguém se desbane, troca de id, muda a data de criação, o "visto por último"
-- ou a confirmação de e-mail por um update direto
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists email_verified_at timestamptz;

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
  new.created_at := old.created_at;
  -- touch_presence e mark_email_verified rodam como dono (postgres); outros updates mantêm os valores
  if current_user <> 'postgres' then
    new.last_seen_at := old.last_seen_at;
    new.email_verified_at := old.email_verified_at;
  end if;
  return new;
end;
$$;

-- ─── 4. FOTOS: CADA UM LISTA SÓ A PRÓPRIA PASTA ─────────────────────────────
drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
