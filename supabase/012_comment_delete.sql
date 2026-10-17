-- ═══════════════════════════════════════════════════════════════════════════
-- 012 · Apagar comentário: só quem escreveu ou um admin
-- Antes, o dono do post também podia apagar comentários de outras pessoas.
-- Rode no SQL Editor do Supabase. Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "comments_delete" on public.post_comments;
create policy "comments_delete" on public.post_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
