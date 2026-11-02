import { json, readBody, env, validUsername, rest, verifyTeacher, getTeacherClasses } from './_shared.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'Gebruik POST.' });

  try {
    const { url, service, anon } = env();
    const { authUser, profile: teacher } = await verifyTeacher(url, service, anon, request);
    const body = await readBody(request);
    const action = String(body.action || '');
    const classes = await getTeacherClasses(url, service, teacher);

    if (action === 'create-class') {
      const name = String(body.name || '').trim();
      if (name.length < 2 || name.length > 80) return json(400, { error: 'Een klasnaam moet 2 tot 80 tekens bevatten.' });
      const existing = await rest(url, service, `classes?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`);
      if (Array.isArray(existing) && existing.length) return json(409, { error: 'Deze klasnaam bestaat al. Kies een unieke naam.' });
      const created = await rest(url, service, 'classes?select=id,name,created_at', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, owner_teacher_id: authUser.id }),
      });
      const item = Array.isArray(created) ? created[0] : null;
      if (!item?.id) throw new Error('De nieuwe klas werd niet teruggegeven door de databank.');
      return json(201, { ok: true, class: item });
    }

    if (action === 'move-student') {
      const username = String(body.username || '').trim().toLowerCase();
      const classId = String(body.classId || '');
      if (!validUsername(username)) return json(400, { error: 'Ongeldige leerlinggebruikersnaam.' });
      const target = classes.find(item => item.id === classId);
      if (!target) return json(403, { error: 'Je kunt leerlingen alleen verplaatsen naar een klas die jij beheert.' });
      const classIds = classes.map(item => item.id);
      const rows = await rest(
        url,
        service,
        `profiles?select=id,username,role,class_id&username=eq.${encodeURIComponent(username)}&role=eq.student&limit=1`
      );
      const student = Array.isArray(rows) ? rows[0] : null;
      if (!student || !classIds.includes(student.class_id)) return json(404, { error: 'Deze leerling is niet gevonden in een van jouw klassen.' });
      if (student.class_id === target.id) return json(200, { ok: true, unchanged: true, username, className: target.name, battlesClosed: 0 });

      await rest(url, service, `profiles?id=eq.${encodeURIComponent(student.id)}&role=eq.student`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ class_id: target.id }),
      });

      // A battle cannot continue after its participants are split across classes.
      const closed = await rest(
        url,
        service,
        `battles?status=in.(pending,active)&or=(challenger_id.eq.${encodeURIComponent(student.id)},opponent_id.eq.${encodeURIComponent(student.id)})`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'declined', current_turn: null, updated_at: new Date().toISOString() }),
        }
      );
      return json(200, { ok: true, username, className: target.name, battlesClosed: Array.isArray(closed) ? closed.length : 0 });
    }

    return json(400, { error: 'Onbekende klasbeheeractie.' });
  } catch (error) {
    return json(400, { error: String(error?.message || 'Klasbeheer is mislukt.') });
  }
};
