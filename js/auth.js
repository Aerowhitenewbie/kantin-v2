import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.SUPABASE_CONFIG;
if (!config?.url || config.url.includes('YOUR_PROJECT') || !config?.anonKey) {
  document.body.innerHTML = '<main class="auth-card"><h1>Konfigurasi diperlukan</h1><p>Salin <code>js/config.example.js</code> menjadi <code>js/config.js</code>, lalu masukkan kredensial Supabase publik Anda.</p></main>';
  throw new Error('Missing Supabase configuration');
}

const cookieStorage = {
  getItem(key) { return document.cookie.split('; ').find(row => row.startsWith(`${encodeURIComponent(key)}=`))?.split('=').slice(1).join('=') ? decodeURIComponent(document.cookie.split('; ').find(row => row.startsWith(`${encodeURIComponent(key)}=`)).split('=').slice(1).join('=')) : null; },
  setItem(key, value) { document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=604800; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; },
  removeItem(key) { document.cookie = `${encodeURIComponent(key)}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; }
};
export const supabase = createClient(config.url, config.anonKey, { auth: { storage: cookieStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data;
}
export async function requireRole(role) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || (role && profile.role !== role)) throw new Error('unauthorised');
    return profile;
  } catch {
    await supabase.auth.signOut();
    window.location.replace('index.html');
    return null;
  }
}
export async function logout() { await supabase.auth.signOut(); window.location.replace('index.html'); }
document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', logout));

if (document.getElementById('login-form')) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) { const p = await getCurrentProfile(); window.location.replace(p?.role === 'admin' ? 'admin.html' : 'dashboard.html'); }
  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const errorBox = document.getElementById('form-error'); errorBox.textContent = '';
    const usernameField = document.getElementById('username');
    const legacyEmailField = document.getElementById('email');
    const pinField = document.getElementById('password');
    const identity = (usernameField?.value || legacyEmailField?.value || '').trim().toLowerCase();
    if (!identity || !pinField) { errorBox.textContent = 'Form login belum lengkap. Perbarui halaman lalu coba lagi.'; return; }
    const email = identity.includes('@') ? identity : `${identity}@login.kantin.local`;
    if (!identity.includes('@') && !/^[a-z0-9._-]{3,40}$/.test(identity)) { errorBox.textContent = 'Username hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda minus.'; return; }
    if (!/^\d{6}$/.test(pinField.value)) { errorBox.textContent = 'PIN harus terdiri dari tepat 6 angka.'; return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pinField.value });
    if (error) { errorBox.textContent = 'Username atau PIN tidak benar.'; return; }
    const profile = await getCurrentProfile();
    window.location.replace(profile?.role === 'admin' ? 'admin.html' : 'dashboard.html');
  });
}
