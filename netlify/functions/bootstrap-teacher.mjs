import { json, readBody, env, validUsername, authEmail, rest, adminAuth } from './_shared.mjs';
export default async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Gebruik POST.' });
  try {
    const secret = process.env.TEACHER_SETUP_SECRET || '';
    if (secret.length < 16) return json(503, { error: 'TEACHER_SETUP_SECRET is nog niet veilig ingesteld in Netlify.' });
    const supplied = event.headers?.['x-teacher-setup-secret'] || event.headers?.['X-Teacher-Setup-Secret'] || '';
    if (!supplied || supplied !== secret) return json(403, { error: 'De setupcode is onjuist.' });
    const { url, service } = env();
    const existingTeachers = await rest(url, service, 'profiles?select=id&role=eq.teacher&limit=1');
    if (existingTeachers.length) return json(409, { error: 'Er bestaat al een leerkrachtaccount. De eenmalige setup is gesloten.' });
    const body = readBody(event);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const className = String(body.className || '').trim();
    if (!validUsername(username)) return json(400, { error: 'Gebruikersnaam moet 3–20 kleine letters, cijfers, _ of - bevatten.' });
    if (password.length < 10) return json(400, { error: 'Gebruik voor het leerkrachtaccount minstens 10 tekens.' });
    if (className.length < 2 || className.length > 80) return json(400, { error: 'Klasnaam moet 2–80 tekens bevatten.' });
    const existingUser = await rest(url, service, `profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`);
    if (existingUser.length) return json(409, { error: 'Deze gebruikersnaam bestaat al.' });
    let classes = await rest(url, service, `classes?select=id,name&name=eq.${encodeURIComponent(className)}&limit=1`);
    if (!classes.length) classes = await rest(url, service, 'classes?select=id,name', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: className }) });
    const classId = classes[0]?.id;
    if (!classId) throw new Error('De klas kon niet worden aangemaakt.');
    const user = await adminAuth(url, service, 'users', { method: 'POST', body: JSON.stringify({ email: authEmail(username), password, email_confirm: true, user_metadata: { username, class_id: classId, role: 'teacher' } }) });
    return json(201, { ok: true, username, className, message: 'Leerkrachtaccount aangemaakt. Je kunt nu inloggen.' });
  } catch (error) {
    const message = String(error?.message || 'Setup mislukt.');
    return json(400, { error: message.includes('already been registered') || message.includes('already exists') ? 'Deze gebruikersnaam bestaat al.' : message });
  }
};
