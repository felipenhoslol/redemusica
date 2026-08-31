-- ==============================================================================
-- REDE DE MÚSICA — SUPABASE DATABASE SCHEMA
-- Tabelas, Relacionamentos, Triggers de Auth, Storage Buckets & RLS Policies
-- ==============================================================================

-- 1. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABELA DE PERFIS (PROFILES) - Vinculada ao Supabase Auth
-- ==============================================================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    email TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    bio TEXT DEFAULT 'Viciado em música 🎧',
    status TEXT DEFAULT 'Ouvindo música boa',
    theme_color TEXT DEFAULT '#5b2d8e',
    pinned_post_id UUID,
    
    -- Integração Spotify / Last.fm
    spotify_connected BOOLEAN DEFAULT false,
    music_service TEXT CHECK (music_service IN ('spotify', 'lastfm')),
    spotify_username TEXT,
    top_artist JSONB DEFAULT NULL,
    top_tracks_month JSONB DEFAULT '[]'::jsonb,
    
    -- Vitrine e Música Fixada
    featured_song JSONB DEFAULT NULL,
    showcase_tracks JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. TRIGGER AUTOMÁTICO: Cria Perfil ao Registrar Novo Usuário no Auth
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_handle TEXT;
BEGIN
  -- Gera handle a partir do metadata ou do e-mail
  raw_handle := COALESCE(
    NEW.raw_user_meta_data->>'handle',
    '@' || split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (
    id,
    name,
    handle,
    email,
    avatar_url,
    bio
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    raw_handle,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'),
    COALESCE(NEW.raw_user_meta_data->>'bio', 'Novo na Rede de Música 🎵')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 4. TABELA DE PUBLICAÇÕES (POSTS)
-- Com suporte a notas decimais (ex: 3.5, 4.5) no rating
-- ==============================================================================
CREATE TABLE public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT,
    lyrics TEXT,
    lyrics_song TEXT,
    lyrics_art TEXT,
    lyrics_card_style TEXT DEFAULT 'compact' CHECK (lyrics_card_style IN ('compact', 'cover', 'fullbleed', 'with-cover')),
    tag TEXT DEFAULT '#música',
    
    -- Avaliação com decimais (0.0 até 5.0, ex: 3.5, 4.5)
    rating NUMERIC(3, 1) DEFAULT 0.0 CHECK (rating >= 0.0 AND rating <= 5.0),
    
    -- Música anexada (id, title, artist, artwork, previewUrl, album)
    song JSONB DEFAULT NULL,
    image_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adiciona Foreign Key de Pinned Post em Profiles
ALTER TABLE public.profiles 
  ADD CONSTRAINT fk_profile_pinned_post 
  FOREIGN KEY (pinned_post_id) 
  REFERENCES public.posts(id) 
  ON DELETE SET NULL;

-- ==============================================================================
-- 5. TABELA DE CURTIDAS, REPOSTS E SALVOS
-- ==============================================================================
CREATE TABLE public.post_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (post_id, user_id)
);

CREATE TABLE public.post_reposts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (post_id, user_id)
);

CREATE TABLE public.post_bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (post_id, user_id)
);

-- ==============================================================================
-- 6. TABELA DE COMENTÁRIOS
-- ==============================================================================
CREATE TABLE public.post_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 7. TABELAS DE PLAYLISTS & FAIXAS (LISTAS PERSONALIZADAS)
-- ==============================================================================
CREATE TABLE public.playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.playlist_tracks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
    track_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    artwork TEXT,
    preview_url TEXT,
    duration_ms INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (playlist_id, track_id)
);

-- ==============================================================================
-- 8. TABELA DE AVALIAÇÕES DE MÚSICAS & DESAFIOS (REVIEWS)
-- Suporte completo a notas decimais (ex: 0.5, 1.5, 3.5, 4.0, 5.0)
-- ==============================================================================
CREATE TABLE public.reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Identificadores da Música
    track_id TEXT NOT NULL,
    track_title TEXT NOT NULL,
    track_artist TEXT NOT NULL,
    track_artwork TEXT,
    track_preview_url TEXT,
    
    -- Contexto (Desafio ou Review livre)
    challenge_id TEXT,
    question_id TEXT,
    
    -- Nota decimal precisa de 0.5 a 5.0
    rating NUMERIC(3, 1) NOT NULL CHECK (rating >= 0.5 AND rating <= 5.0),
    comment TEXT,
    
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 9. TABELA DE SEGUIDORES (FOLLOWS)
-- ==============================================================================
CREATE TABLE public.follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- ==============================================================================
-- 10. TABELA DE MENSAGENS (CHAT / DM)
-- ==============================================================================
CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    to_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT,
    song JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 11. TABELA DE NOTIFICAÇÕES
-- ==============================================================================
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'repost', 'comment', 'follow', 'review', 'mention')),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 12. STORAGE BUCKETS (AVATARES, BANNERS, POSTS, CAPAS)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('post_images', 'post_images', true),
  ('playlist_covers', 'playlist_covers', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage (Upload apenas autenticado no seu folder, Leitura pública)
CREATE POLICY "Public Read Access Avatars" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated Users Upload Avatars" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public Read Access Banners" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'banners');

CREATE POLICY "Authenticated Users Upload Banners" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'banners');

CREATE POLICY "Public Read Access Post Images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'post_images');

CREATE POLICY "Authenticated Users Upload Post Images" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'post_images');

CREATE POLICY "Public Read Access Playlist Covers" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'playlist_covers');

CREATE POLICY "Authenticated Users Upload Playlist Covers" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'playlist_covers');

-- ==============================================================================
-- 13. ROW LEVEL SECURITY (RLS) & POLICIES EM TODAS AS TABELAS
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── PROFILES POLICIES ──
CREATE POLICY "Profiles são públicos para visualização" 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Usuários podem atualizar seus próprios perfis" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ── POSTS POLICIES ──
CREATE POLICY "Posts são públicos para leitura" 
ON public.posts FOR SELECT USING (true);

CREATE POLICY "Usuários autenticados podem criar posts" 
ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Autores podem atualizar seus posts" 
ON public.posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Autores podem deletar seus posts" 
ON public.posts FOR DELETE USING (auth.uid() = author_id);

-- ── LIKES, REPOSTS, BOOKMARKS ──
CREATE POLICY "Likes públicos para leitura" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem curtir" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem remover sua curtida" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Reposts públicos para leitura" ON public.post_reposts FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem repostar" ON public.post_reposts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem remover repost" ON public.post_reposts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Bookmarks privados do usuário" ON public.post_bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários autenticados podem salvar" ON public.post_bookmarks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem remover salvos" ON public.post_bookmarks FOR DELETE USING (auth.uid() = user_id);

-- ── COMMENTS ──
CREATE POLICY "Comentários são públicos para leitura" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem comentar" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Autores podem deletar seus comentários" ON public.post_comments FOR DELETE USING (auth.uid() = author_id);

-- ── PLAYLISTS & TRACKS ──
CREATE POLICY "Playlists públicas para leitura" ON public.playlists FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem criar playlists" ON public.playlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Autores podem atualizar suas playlists" ON public.playlists FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Autores podem deletar suas playlists" ON public.playlists FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Faixas de playlist públicas para leitura" ON public.playlist_tracks FOR SELECT USING (true);
CREATE POLICY "Donos da playlist podem adicionar faixas" ON public.playlist_tracks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND author_id = auth.uid())
);
CREATE POLICY "Donos da playlist podem remover faixas" ON public.playlist_tracks FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND author_id = auth.uid())
);

-- ── REVIEWS (AVALIAÇÕES) ──
CREATE POLICY "Reviews públicas para leitura" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem avaliar" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "Avaliadores podem atualizar sua avaliação" ON public.reviews FOR UPDATE USING (auth.uid() = reviewer_id);
CREATE POLICY "Avaliadores podem deletar sua avaliação" ON public.reviews FOR DELETE USING (auth.uid() = reviewer_id);

-- ── FOLLOWS ──
CREATE POLICY "Follows públicos para leitura" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem seguir" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Usuários podem deixar de seguir" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- ── MESSAGES (CHAT) ──
CREATE POLICY "Usuários podem ver suas conversas" ON public.messages FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Usuários autenticados podem enviar mensagens" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);

-- ── NOTIFICATIONS ──
CREATE POLICY "Usuários podem ver suas próprias notificações" ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Usuários autenticados podem disparar notificações" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Usuários podem atualizar leitura de suas notificações" ON public.notifications FOR UPDATE USING (auth.uid() = recipient_id);
