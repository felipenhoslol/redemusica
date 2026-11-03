-- ═══════════════════════════════════════════════════════════════════════════
-- 015 · Notificações no celular (app Android, Firebase Cloud Messaging)
-- Rode depois do 014_rankings.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Cada aparelho com o app guarda aqui o seu token do FCM e quais avisos quer.
-- Quando entra um post ou uma mensagem, um gatilho chama a Edge Function push-notify
-- (só manda os ids; a função lê o resto com a service role). Passo a passo: docs/push-setup.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. APARELHOS ───────────────────────────────────────────────────────────
create table if not exists public.push_devices (
  token            text primary key check (char_length(token) between 20 and 4096),
  user_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  platform         text not null default 'android' check (platform in ('android')),
  notify_posts     boolean not null default true,
  notify_messages  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);

drop trigger if exists push_devices_touch on public.push_devices;
create trigger push_devices_touch before update on public.push_devices
  for each row execute function public.touch_updated_at();

alter table public.push_devices enable row level security;

-- Cada um vê e apaga só os próprios aparelhos
drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own" on public.push_devices for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own" on public.push_devices for delete to authenticated
  using (user_id = auth.uid());

-- Gravar passa por esta função: o mesmo celular pode trocar de conta, e aí o token
-- (que só o próprio aparelho conhece) passa para quem está logado agora.
create or replace function public.save_push_device(p_token text, p_posts boolean, p_messages boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_devices (token, user_id, notify_posts, notify_messages)
  values (p_token, auth.uid(), coalesce(p_posts, true), coalesce(p_messages, true))
  on conflict (token) do update
    set user_id = excluded.user_id,
        notify_posts = excluded.notify_posts,
        notify_messages = excluded.notify_messages;
end;
$$;
revoke all on function public.save_push_device(text, boolean, boolean) from public, anon;
grant execute on function public.save_push_device(text, boolean, boolean) to authenticated;

-- ─── 2. AVISOS JÁ ENVIADOS (evita mandar o mesmo evento duas vezes) ─────────
-- Só a Edge Function (service role) usa; sem políticas = fechado para o app.
create table if not exists public.push_sent (
  event_id    text primary key,
  created_at  timestamptz not null default now()
);
alter table public.push_sent enable row level security;

-- ─── 3. GATILHO: post ou mensagem novos chamam a Edge Function ──────────────
-- A URL e o segredo ficam no Vault (veja docs/push-setup.md). Sem eles, não faz nada.
-- Nunca atrapalha o insert: pg_net é assíncrono e qualquer erro vira só um aviso no log.
create extension if not exists pg_net with schema extensions;

create or replace function public.push_notify_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_notify_secret';
  if fn_url is null or fn_secret is null then return null; end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
    timeout_milliseconds := 8000
  );
  return null;
exception when others then
  raise warning 'push_notify_event: %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.push_notify_event() from public, anon, authenticated;

drop trigger if exists posts_push_notify on public.posts;
create trigger posts_push_notify after insert on public.posts
  for each row execute function public.push_notify_event();

drop trigger if exists messages_push_notify on public.messages;
create trigger messages_push_notify after insert on public.messages
  for each row execute function public.push_notify_event();
