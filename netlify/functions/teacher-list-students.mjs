import { json, env, rest, verifyTeacher } from './_shared.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'GET') return json(405, { error: 'Gebruik GET.' });

  try {
    const { url, service, anon } = env();
    const { profile: teacher } = await verifyTeacher(url, service, anon, request);
    const students = await rest(
      url,
      service,
      `profiles?select=username,xp,created_at&class_id=eq.${encodeURIComponent(teacher.class_id)}&role=eq.student&order=username.asc`
    );
    return json(200, { students: Array.isArray(students) ? students : [] });
  } catch (error) {
    return json(403, { error: String(error?.message || 'Leerlingen ophalen is mislukt.') });
  }
};
