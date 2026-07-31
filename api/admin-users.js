import { createClient } from '@supabase/supabase-js';

const adminClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
async function verifyAdmin(request) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin';
}
export default async function handler(request, response) {
  if (!await verifyAdmin(request)) return response.status(403).json({ error: 'Admin access required' });
  const db = adminClient();
  try {
    if (request.method === 'POST') {
      const { email, password, full_name, student_number, class_name, balance } = request.body;
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, student_number, class_name } });
      if (error) throw error;
      const { error: updateError } = await db.from('profiles').update({ balance: Number(balance) || 0 }).eq('id', data.user.id);
      if (updateError) throw updateError;
      return response.status(201).json({ id: data.user.id });
    }
    if (request.method === 'DELETE') {
      const id = request.query.id;
      if (!id) return response.status(400).json({ error: 'Student id required' });
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw error;
      return response.status(204).end();
    }
    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) { return response.status(400).json({ error: error.message || 'Request failed' }); }
}
