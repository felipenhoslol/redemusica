-- ═══════════════════════════════════════════════════════════════════════════
-- 007 · Mensagens diretas (chat)
-- Rode depois do 006_presence.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Antes, as mensagens ficavam só no navegador de quem enviou e nunca chegavam.
-- Agora vão para o banco: cada conversa só é vista por quem enviou e por quem recebeu.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.messages (
  id          text primary key check (id ~ '^msg_[A-Za-z0-9_]{4,60}$'),
  from_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  body        jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 700000),
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists messages_to_idx   on public.messages (to_id, created_at desc);
create index if not exists messages_from_idx on public.messages (from_id, created_at desc);

alter table public.messages enable row level security;

-- Só os dois lados da conversa leem
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Envia em seu nome, se a conta não estiver banida
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages for insert to authenticated
  with check (from_id = auth.uid() and public.can_post());

-- Quem enviou edita e apaga as próprias mensagens
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update to authenticated
  using (from_id = auth.uid()) with check (from_id = auth.uid());

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages for delete to authenticated
  using (from_id = auth.uid());

-- Ninguém troca remetente, destinatário ou data numa edição
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
  return new;
end;
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages
  for each row execute function public.guard_message_update();
