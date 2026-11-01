import { json, readBody, env, validUsername, rest, adminAuth, verifyTeacher } from './_shared.mjs';
export default async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Gebruik POST.' });
  try {
    const { url, service, anon } = env();
    const { profile: teacher } = await verifyTeacher(url, service, anon, event);
    const body = readBody(event);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!validUsername(username) || password.length < 8 || password.length > 128) return json(400, { error: 'Controleer de gebruikersnaam en gebruik een wachtwoord van 8–128 tekens.' });
    const rows = await rest(url, service, `profiles?select=id,role&class_id=eq.${encodeURIComponent(teacher.class_id)}&username=eq.${encodeURIComponent(username)}&limit=1`);
    const student = rows[0];
    if (!student || student.role !== 'student') return json(404, { error: 'Geen leerling met die gebruikersnaam gevonden in jouw klas.' });
    await adminAuth(url, service, `users/${encodeURIComponent(student.id)}`, { method: 'PUT', body: JSON.stringify({ password }) });
    return json(200, { ok: true, username });
  } catch (error) { return json(403, { error: String(error?.message || 'Wachtwoord resetten mislukt.') }); }
};
