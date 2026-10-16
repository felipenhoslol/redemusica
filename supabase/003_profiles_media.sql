-- ═══════════════════════════════════════════════════════════════════════════
-- 003 · Perfil completo compartilhado + fotos no Storage
-- Rode depois do 002_posts.sql, no SQL Editor do Supabase. Pode rodar de novo.
--
-- profiles ganha banner, bio, status e "extras" (Last.fm, redes sociais, música em
-- destaque, vitrine...). Fotos de perfil e banners vão para o bucket público "media",
-- numa pasta com o id de quem enviou: só o dono escreve ali.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists bio        text;
alter table public.profiles add column if not exists status     text;
alter table public.profiles add column if not exists extras     jsonb not null default '{}'::jsonb;

-- Limites (só https nas imagens: nada de data: ou javascript: no banco)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_check') then
    alter table public.profiles add constraint profiles_avatar_url_check
      check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_banner_url_check') then
    alter table public.profiles add constraint profiles_banner_url_check
      check (banner_url is null or (banner_url ~ '^https://' and char_length(banner_url) <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_check') then
    alter table public.profiles add constraint profiles_bio_check check (bio is null or char_length(bio) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check check (status is null or char_length(status) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_extras_check') then
    alter table public.profiles add constraint profiles_extras_check
      check (jsonb_typeof(extras) = 'object' and pg_column_size(extras) <= 60000);
  end if;
end $$;

-- ─── Storage: bucket público "media" ────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Qualquer um vê; cada usuário só envia, troca e apaga arquivos na própria pasta (<id>/...)
drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "media_insert_own" on storage.objects;
create policy "media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text and public.can_post());

drop policy if exists "media_update_own" on storage.objects;
create policy "media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
