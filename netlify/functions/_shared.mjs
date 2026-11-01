export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  body: JSON.stringify(body),
});
export const readBody = (event) => { try { return JSON.parse(event.body || '{}'); } catch { return {}; } };
export const env = () => {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !service) throw new Error('Netlify mist SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.');
  return { url, service, anon };
};
export const validUsername = (s) => /^[a-z0-9_-]{3,20}$/.test(String(s || ''));
export const authEmail = (username) => `${String(username).toLowerCase()}@accounts.chemieescape.invalid`;
export const apiHeaders = (service, extra = {}) => ({ apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', ...extra });
export async function rest(url, service, path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: apiHeaders(service, options.headers || {}) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || 'Databasebewerking mislukt.');
  return data;
}
export async function adminAuth(url, service, path, options = {}) {
  const response = await fetch(`${url}/auth/v1/admin/${path}`, { ...options, headers: apiHeaders(service, options.headers || {}) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.message || 'Auth-bewerking mislukt.');
  return data;
}
export async function verifyTeacher(url, service, anon, event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('Log in als leerkracht om dit te doen.');
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon || service, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Je sessie is ongeldig of verlopen. Log opnieuw in.');
  const authUser = await response.json();
  const rows = await rest(url, service, `profiles?select=id,username,class_id,role&id=eq.${encodeURIComponent(authUser.id)}&limit=1`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.role !== 'teacher' || !profile.class_id) throw new Error('Alleen een ingelogde leerkracht heeft toegang tot klasbeheer.');
  return { authUser, profile };
}
