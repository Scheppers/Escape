// Shared helpers for modern Netlify Functions (Request -> Response).
export const json = (statusCode, body) => Response.json(body, {
  status: statusCode,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

export const readBody = async (request) => {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

export const env = () => {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !service) throw new Error('Netlify mist SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.');
  return { url, service, anon };
};

export const validUsername = (s) => /^[a-z0-9_-]{3,20}$/.test(String(s || ''));
export const authEmail = (username) => `${String(username).toLowerCase()}@accounts.chemieescape.invalid`;
export const apiHeaders = (service, extra = {}) => ({
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
  ...extra,
});

export async function rest(url, service, path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: apiHeaders(service, options.headers || {}),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || data?.details || 'Databasebewerking mislukt.');
  }
  return data;
}

export async function adminAuth(url, service, path, options = {}) {
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    ...options,
    headers: apiHeaders(service, options.headers || {}),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || 'Auth-bewerking mislukt.');
  }
  return data;
}


export async function getTeacherClasses(url, service, profile) {
  const teacherId = profile?.id;
  if (!teacherId) throw new Error('Het leerkrachtaccount kon niet worden geïdentificeerd.');
  let classes = await rest(
    url,
    service,
    `classes?select=id,name,created_at,owner_teacher_id&owner_teacher_id=eq.${encodeURIComponent(teacherId)}&order=name.asc`
  );
  classes = Array.isArray(classes) ? classes : [];
  // Backwards compatibility: claim the teacher's original class if an older
  // installation has not yet assigned an owner_teacher_id during migration.
  const homeId = profile.class_id;
  if (homeId && !classes.some(item => item.id === homeId)) {
    const homeRows = await rest(url, service, `classes?select=id,name,created_at,owner_teacher_id&id=eq.${encodeURIComponent(homeId)}&limit=1`);
    const home = Array.isArray(homeRows) ? homeRows[0] : null;
    if (home && (!home.owner_teacher_id || home.owner_teacher_id === teacherId)) {
      if (!home.owner_teacher_id) {
        await rest(url, service, `classes?id=eq.${encodeURIComponent(homeId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ owner_teacher_id: teacherId }),
        });
      }
      classes.push({ ...home, owner_teacher_id: teacherId });
    }
  }
  return classes.sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl'));
}

export async function verifyTeacher(url, service, anon, request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('Log in als leerkracht om dit te doen.');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon || service, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Je sessie is ongeldig of verlopen. Log opnieuw in.');
  const authUser = await response.json();
  const rows = await rest(url, service, `profiles?select=id,username,class_id,role&id=eq.${encodeURIComponent(authUser.id)}&limit=1`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.role !== 'teacher' || !profile.class_id) {
    throw new Error('Alleen een ingelogde leerkracht heeft toegang tot klasbeheer.');
  }
  return { authUser, profile };
}
