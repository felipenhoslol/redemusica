// Adds the made-up contact that tools/perf/chat-media.js talks to (users are cached at boot, hence --setup).
async () => {
  const contact = { id: 'perf_chat', name: 'Lia Prado', handle: '@lia_perf', avatar: 'L', bio: '', status: '' };
  const users = JSON.parse(localStorage.getItem('rmsn_users_v5') || '[]').filter(u => u.id !== contact.id);
  localStorage.setItem('rmsn_users_v5', JSON.stringify([...users, contact]));
  return { pass: true };
}
