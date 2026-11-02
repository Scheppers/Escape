import { json, env, rest, verifyTeacher, getTeacherClasses } from './_shared.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'GET') return json(405, { error: 'Gebruik GET.' });

  try {
    const { url, service, anon } = env();
    const { profile: teacher } = await verifyTeacher(url, service, anon, request);
    const classes = await getTeacherClasses(url, service, teacher);
    const ids = classes.map(item => item.id);
    if (!ids.length) return json(200, { classes: [], students: [] });
    const classFilter = `in.(${ids.join(',')})`;
    const rows = await rest(
      url,
      service,
      `profiles?select=username,xp,created_at,class_id&class_id=${encodeURIComponent(classFilter)}&role=eq.student&order=username.asc`
    );
    const names = new Map(classes.map(item => [item.id, item.name]));
    const students = (Array.isArray(rows) ? rows : []).map(student => ({
      ...student,
      class_name: names.get(student.class_id) || 'Onbekende klas',
    }));
    return json(200, {
      classes: classes.map(({ id, name, created_at }) => ({ id, name, created_at })),
      students,
    });
  } catch (error) {
    return json(403, { error: String(error?.message || 'Leerlingen en klassen ophalen is mislukt.') });
  }
};
