import { json, readBody, env, validUsername, authEmail, rest, adminAuth, verifyTeacher } from './_shared.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'Gebruik POST.' });

  try {
    const { url, service, anon } = env();
    const { profile: teacher } = await verifyTeacher(url, service, anon, request);
    const { students = [] } = await readBody(request);
    if (!Array.isArray(students) || students.length < 1 || students.length > 30) {
      return json(400, { error: 'Maak tussen 1 en 30 accounts per keer aan.' });
    }

    const seen = new Set();
    for (const student of students) {
      const username = String(student.username || '').trim().toLowerCase();
      const password = String(student.password || '');
      if (!validUsername(username)) return json(400, { error: `Ongeldige gebruikersnaam: ${username}` });
      if (password.length < 8 || password.length > 128) return json(400, { error: `Wachtwoord voor ${username} moet 8–128 tekens bevatten.` });
      if (seen.has(username)) return json(400, { error: `Dubbele gebruikersnaam: ${username}` });
      seen.add(username);
    }

    const created = [];
    const errors = [];
    for (const student of students) {
      const username = String(student.username).trim().toLowerCase();
      try {
        const exists = await rest(url, service, `profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`);
        if (exists.length) throw new Error('Gebruikersnaam bestaat al.');
        await adminAuth(url, service, 'users', {
          method: 'POST',
          body: JSON.stringify({
            email: authEmail(username),
            password: String(student.password),
            email_confirm: true,
            user_metadata: { username, class_id: teacher.class_id, role: 'student' },
          }),
        });
        created.push({ username });
      } catch (error) {
        const message = String(error?.message || 'Aanmaken mislukt.');
        errors.push({
          username,
          error: message.includes('already been registered') || message.includes('already exists')
            ? 'Gebruikersnaam bestaat al.'
            : message,
        });
      }
    }

    return json(created.length ? 201 : 400, { ok: errors.length === 0, created, errors });
  } catch (error) {
    return json(403, { error: String(error?.message || 'Niet toegestaan.') });
  }
};
