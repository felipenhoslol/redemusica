-- ═══════════════════════════════════════════════════════════════════════════
-- 008 · Entrar sem confirmar o e-mail (confirmação fica para depois)
-- Rode depois do 007_messages.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- Depois de rodar, no painel: Authentication → Providers (ou Sign In / Providers) → Email
-- → desligue "Confirm email". Assim quem se cadastra já entra direto.
--
-- Com isso o Supabase passa a marcar todo mundo como "confirmado" sozinho, então o app
-- guarda a confirmação de verdade aqui (profiles.email_verified_at). Ela só é marcada
-- quando a pessoa entra por um link enviado ao e-mail (o lembrete nas notificações manda
-- esse link): é a prova de que o e-mail é dela.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists email_verified_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz; -- do 006, caso ele não tenha rodado

-- Quem já tinha confirmado pelo fluxo antigo continua confirmado
update public.profiles p
   set email_verified_at = u.email_confirmed_at
  from auth.users u
 where u.id = p.id
   and p.email_verified_at is null
   and u.email_confirmed_at is not null
   and u.email_confirmed_at < now() - interval '1 minute';

-- Marca o e-mail como confirmado se a sessão atual veio de um link de e-mail
-- (magic link, confirmação de cadastro, troca de e-mail ou recuperação de senha)
create or replace function public.mark_email_verified()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  from_link boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
     where a->>'method' in ('otp', 'magiclink', 'email/signup', 'email_change', 'recovery', 'invite')
  ) into from_link;
  if from_link then
    update public.profiles set email_verified_at = coalesce(email_verified_at, now()) where id = auth.uid();
  end if;
  return exists (select 1 from public.profiles where id = auth.uid() and email_verified_at is not null);
end;
$$;

revoke all on function public.mark_email_verified() from public, anon;
grant execute on function public.mark_email_verified() to authenticated;

-- Ninguém marca o próprio e-mail (ou o "visto por último") direto no update do perfil
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
  -- touch_presence e mark_email_verified rodam como dono (postgres); outros updates mantêm os valores
  if current_user <> 'postgres' then
    new.last_seen_at := old.last_seen_at;
    new.email_verified_at := old.email_verified_at;
  end if;
  return new;
end;
$$;
