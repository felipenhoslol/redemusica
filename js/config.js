// Configuração pública do app (valores que podem ficar no navegador).

/**
 * Chave da API do Last.fm (só leitura: perfis, top artistas e top músicas).
 * Crie a sua, grátis, em https://www.last.fm/api/account/create e cole o campo "API key" aqui.
 * Não use o "Shared secret": ele não é necessário para leitura e não deve ficar no front-end.
 */
export const LASTFM_API_KEY = '61d0fc7357a80eb929ba96ecfa943754';

/**
 * Projeto Supabase (Project Settings → API). A "anon public" key é feita para ficar no navegador:
 * quem protege os dados são as regras de RLS de supabase/001_auth_feedback_admin.sql.
 * Nunca coloque aqui a "service_role" key.
 */
export const SUPABASE_URL = 'https://gdojwfpujfhpjhtgjkmi.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkb2p3ZnB1amZocGpodGdqa21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTUzNjgsImV4cCI6MjEwNzU5MTM2OH0.yjT2R0eOoJA9-Q3bETCUoev6cN3Dsz4eqWhZPoeCl-4';
