-- ═══════════════════════════════════════════════════════════════════════════
-- 011 · "Visto" no chat
-- Rode depois do 010_admin_badge.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- messages.read_at guarda quando quem recebeu abriu a conversa. Só quem recebeu marca,
-- e só pela função abaixo (a política de edição continua sendo só de quem enviou).
-- O "digitando…" não usa o banco: vai pelo canal em tempo real do Supabase (broadcast).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages add column if not exists read_at timestamptz;
create index if not exists messages_unread_idx on public.messages (to_id, from_id) where read_at is null;

-- Marca como lidas as mensagens que p_from mandou para você
create or replace function public.mark_messages_read(p_from uuid)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with done as (
    update public.messages set read_at = now()
     where to_id = auth.uid() and from_id = p_from and read_at is null
    returning 1
  )
  select count(*)::integer from done;
$$;

revoke all on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;
