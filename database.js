import { supabase } from './auth.js';
export const getMenu = async () => { const q = await supabase.from('menu_items').select('*').order('category').order('name'); if (q.error) throw q.error; return q.data; };
export const getMyTransactions = async (date) => { let q = supabase.from('transactions').select('*, transaction_items(*)').order('transaction_date', { ascending:false }).order('transaction_time',{ascending:false}); if(date) q=q.eq('transaction_date',date); const r=await q; if(r.error) throw r.error; return r.data; };
export const purchase = async (items, date, time) => { const r=await supabase.rpc('create_purchase',{ p_items: items.map(({id,quantity})=>({menu_item_id:id,quantity})), p_date:date, p_time:time }); if(r.error) throw r.error; return r.data; };
export const getReports = async () => { const r=await supabase.from('daily_transaction_reports').select('*').order('transaction_date',{ascending:false}); if(r.error) throw r.error; return r.data; };
export const getStudents = async () => { const r=await supabase.from('profiles').select('*').eq('role','student').order('full_name'); if(r.error) throw r.error; return r.data; };
export const updateStudentBalance = async (id,balance) => { const r=await supabase.from('profiles').update({balance}).eq('id',id); if(r.error) throw r.error; };
export const saveMenu = async menu => { const {id,...data}=menu; const r=id ? await supabase.from('menu_items').update(data).eq('id',id) : await supabase.from('menu_items').insert(data); if(r.error) throw r.error; };
export const deleteMenu = async id => { const r=await supabase.from('menu_items').delete().eq('id',id); if(r.error) throw r.error; };
async function adminUserRequest(method, body, id) { const { data: { session } } = await supabase.auth.getSession(); const r = await fetch(`/api/admin-users${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Permintaan akun gagal'); return data; }
export const createStudent = data => adminUserRequest('POST', data);
export const removeStudent = id => adminUserRequest('DELETE', null, id);
