import { json, readBody, env, validUsername, rest, adminAuth, verifyTeacher, getTeacherClasses } from './_shared.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'Gebruik POST.' });

  try {
    const { url, service, anon } = env();
    const { profile: teacher } = await verifyTeacher(url, service, anon, request);
    const body = await readBody(request);
    const username = String(body.username || '').trim().toLowerCase();

    if (!validUsername(username)) {
      return json(400, { error: 'Vul een geldige gebruikersnaam in (3–20 kleine letters, cijfers, _ of -).' });
    }

    // A teacher may only delete students enrolled in one of their own classes.
    const classes = await getTeacherClasses(url, service, teacher);
    const classIds = classes.map(item => item.id);
    const rows = classIds.length ? await rest(
      url,
      service,
      `profiles?select=id,username,role,class_id&class_id=${encodeURIComponent(`in.(${classIds.join(',')})`)}&username=eq.${encodeURIComponent(username)}&limit=1`
    ) : [];
    const student = Array.isArray(rows) ? rows[0] : null;
    if (!student || student.role !== 'student') {
      return json(404, { error: 'Geen leerling met die gebruikersnaam gevonden in jouw klassen.' });
    }

    // Removing the Auth user cascades to profiles and all user-owned game data
    // according to the ON DELETE CASCADE relationships in supabase/schema.sql.
    await adminAuth(url, service, `users/${encodeURIComponent(student.id)}`, { method: 'DELETE' });
    return json(200, { ok: true, username, deleted: true });
  } catch (error) {
    return json(403, { error: String(error?.message || 'Leerlingaccount verwijderen is mislukt.') });
  }
};
