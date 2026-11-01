(function () {
  'use strict';
  const config = window.CHEMIE_SUPABASE_CONFIG || {};
  const root = document.getElementById('online-root');
  const notice = document.getElementById('online-notice');
  const authBox = document.getElementById('online-auth-box');
  const dashboard = document.getElementById('online-dashboard');
  const authStatus = document.getElementById('online-auth-status');
  const view = document.getElementById('online-view');
  const nav = document.getElementById('online-nav');
  const summary = document.getElementById('online-summary');
  let supabase = null, currentUser = null, currentProfile = null, currentView = 'home';
  const AUTH_DOMAIN = 'accounts.chemieescape.invalid';
  const authEmail = (username) => `${String(username || '').trim().toLowerCase()}@${AUTH_DOMAIN}`;
  let refreshTimer = null, lastBattleIds = '';
  let teacherQuestionCache = [], teacherQuestionLevel = 'medieval';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const msg = (text, kind = '') => { if (authStatus) { authStatus.textContent = text; authStatus.className = `online-status ${kind}`; } };
  const configured = Boolean(config.url && config.anonKey && !/VUL|YOUR_|PASTE/i.test(config.url + config.anonKey));
  const rpc = async (name, args = {}) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const requireLogin = () => { if (!currentUser) throw new Error('Meld je eerst aan om deze functie te gebruiken.'); };

  async function teacherFunction(name, { method = 'POST', body } = {}) {
    requireLogin();
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht kan dit doen.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Je sessie is verlopen. Log opnieuw in.');
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const options = { method, headers };
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const response = await fetch(`/.netlify/functions/${name}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `De bewerking ${name} is mislukt.`);
    return result;
  }
  const LEVELS_FOR_QUESTIONS = [
    { id: 'medieval', name: 'Leerjaar 1 · Middeleeuws labo', objects: { object1:'Kookpot', object2:'Oud boek', object3:'Glazen potten', object4:'Werktafel' } },
    { id: 'lavoisier', name: 'Leerjaar 2 · Lavoisierlabo', objects: { object1:'Balans', object2:'Notities van Lavoisier', object3:'Glaswerk', object4:'Proefopstelling' } },
    { id: 'modern', name: 'Leerjaar 3 · Modern labo', objects: { object1:'Reageerbuizen', object2:'Weegschaal', object3:'Maatkolf', object4:'Periodiek systeem' } },
    { id: 'future', name: 'Leerjaar 4 · Futuristisch labo', objects: { object1:'Robotarm', object2:'Hologram', object3:'Reactor', object4:'Tijdpoort' } }
  ];


  function showAuth() {
    authBox?.classList.remove('hidden'); dashboard?.classList.add('hidden');
    summary && (summary.innerHTML = '<span class="online-muted">Log in met je door de leerkracht uitgedeelde gebruikersnaam en wachtwoord.</span>');
  }
  function showDashboard() { authBox?.classList.add('hidden'); dashboard?.classList.remove('hidden'); }
  async function loadProfile() {
    requireLogin();
    const { data, error } = await supabase.from('profiles').select('id,username,class_id,role,xp,coins,equipped_skin,created_at').eq('id', currentUser.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Je accountprofiel wordt nog aangemaakt. Ververs over enkele seconden.');
    if (!data.class_id) throw new Error('Dit account is nog niet aan een klas gekoppeld. Vraag de leerkracht om het account opnieuw aan te maken of laat de beheerder de oude accounts aan een klas koppelen.');
    currentProfile = data;
    const teacherNav = document.getElementById('online-teacher-nav');
    teacherNav?.classList.toggle('hidden', data.role !== 'teacher');
    nav?.querySelectorAll('[data-online-view="cards"],[data-online-view="skins"],[data-online-view="battles"]').forEach(b => b.classList.toggle('hidden', data.role === 'teacher'));
    const level = Math.floor(Number(data.xp) / 100) + 1;
    summary.innerHTML = `<div class="online-profile"><span class="online-avatar">${esc((window.ChemieGameBridge?.getEconomyState?.().equippedSkin === 'brass') ? '🥽' : '🧪')}</span><div class="online-profile-copy"><strong>${esc(data.username)}</strong><small>Level ${level} · ${Number(data.xp)} XP</small></div><div class="online-currency">🪙 ${Number(data.coins)}<small>LabCoins</small></div></div>`;
    if (window.ChemieGameBridge) {
      const econ = await getEconomy();
      window.ChemieGameBridge.applyOnlineEconomy(econ);
    }
    return data;
  }
  async function getEconomy() {
    requireLogin();
    const [{ data: profile, error: pErr }, { data: skins, error: sErr }] = await Promise.all([
      supabase.from('profiles').select('coins,equipped_skin').eq('id', currentUser.id).single(),
      supabase.from('user_skins').select('skin_id').eq('user_id', currentUser.id)
    ]);
    if (pErr) throw pErr; if (sErr) throw sErr;
    return { coins: Number(profile.coins), equippedSkin: profile.equipped_skin, ownedSkins: (skins || []).map(x => x.skin_id) };
  }
  async function refreshDashboard() {
    if (!currentUser) return;
    try { await loadProfile(); if (currentView === 'leaderboard') await renderLeaderboard(); else if (currentView === 'cards') await renderCards(); else if (currentView === 'skins') await renderSkins(); else if (currentView === 'battles') await renderBattles(); }
    catch (e) { console.error(e); msg(e.message || 'Vernieuwen is mislukt.', 'bad'); }
  }
  function setView(name) {
    currentView = name;
    nav?.querySelectorAll('[data-online-view]').forEach(b => b.classList.toggle('active', b.dataset.onlineView === name));
    const renderers = { home: renderHome, leaderboard: renderLeaderboard, cards: renderCards, skins: renderSkins, battles: renderBattles, teacher: renderTeacher };
    if (name === 'teacher' && currentProfile?.role !== 'teacher') { name = 'home'; currentView = name; }
    Promise.resolve(renderers[name]?.()).catch(e => { console.error(e); if (view) view.innerHTML = `<p class="online-status bad">${esc(e.message || 'Er ging iets mis.')}</p>`; });
  }
  async function renderHome() {
    if (!view || !currentProfile) return;
    const xp = Number(currentProfile.xp), level = Math.floor(xp / 100) + 1, rem = xp % 100;
    if (currentProfile.role === 'teacher') {
      view.innerHTML = `<div class="online-home-grid"><article class="online-mini-card"><span>🏫</span><strong>Klasbeheer</strong><small>Maak leerlingaccounts aan en reset wachtwoorden via het tabblad Klasbeheer.</small></article><article class="online-mini-card"><span>🏆</span><strong>XP-ranking van je klas</strong><small>Je ziet de voortgang van de leerlingen uit jouw klas.</small></article><article class="online-mini-card"><span>🔐</span><strong>Geen zelfregistratie</strong><small>Leerlingen kunnen alleen inloggen met een account dat jij aanmaakt.</small></article></div><p class="online-help">De leerkracht beheert de accounts. Leerlingen zien elkaars gebruikersnamen en XP binnen dezelfde klas; andere klassen blijven afgeschermd.</p>`;
      return;
    }
    view.innerHTML = `<div class="online-home-grid"><article class="online-mini-card"><span>⭐</span><strong>${xp} XP</strong><small>${rem}/100 XP tot level ${level + 1}</small><div class="online-xp-bar"><i style="width:${rem}%"></i></div></article><article class="online-mini-card"><span>🪙</span><strong>${Number(currentProfile.coins)} LabCoins</strong><small>Verdien coins met de Elementensprint, de Zurenkennis-sprint en de virtuele kluisreactie.</small></article><article class="online-mini-card"><span>🧬</span><strong>Kaartenbataljon</strong><small>Koop stofkaarten en daag een klasgenoot uit.</small></article></div><p class="online-help">De gewone puzzels geven XP. LabCoins verdien je via de optionele Elementensprint, de Zurenkennis-sprint en de virtuele kluisreactie. Met coins koop je kaarten en skins. De ranking en battles zijn beperkt tot jouw klas.</p>`;
  }
  async function renderLeaderboard() {
    const rows = await rpc('get_leaderboard', { p_limit: 20 });
    view.innerHTML = `<div class="online-view-heading"><div><h3>🏆 XP-ranking</h3><p>Alleen leerlingen uit jouw klas zijn zichtbaar.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><div class="online-table-wrap"><table class="online-table"><thead><tr><th>#</th><th>Speler</th><th>Level</th><th>XP</th></tr></thead><tbody>${(rows || []).map(r => `<tr class="${r.username === currentProfile?.username ? 'is-me' : ''}"><td>${Number(r.position)}</td><td>${esc(r.username)}${r.username === currentProfile?.username ? ' (jij)' : ''}</td><td>${Number(r.level)}</td><td>${Number(r.xp)}</td></tr>`).join('') || '<tr><td colspan="4">Nog geen rankinggegevens.</td></tr>'}</tbody></table></div>`;
  }
  async function renderSkins() {
    const [{ data: catalog, error: cErr }, econ] = await Promise.all([
      supabase.from('skin_catalog').select('id,name,emoji,price,description').order('price'), getEconomy()
    ]);
    if (cErr) throw cErr;
    const cards = (catalog || []).map(s => {
      const owned = econ.ownedSkins.includes(s.id), equipped = econ.equippedSkin === s.id;
      let label = equipped ? '✓ Uitgerust' : owned ? 'Uitrusten' : `Koop · ${s.price} coins`;
      return `<article class="online-store-card"><div class="online-store-emoji">${esc(s.emoji)}</div><h4>${esc(s.name)}</h4><p>${esc(s.description)}</p><strong>🪙 ${Number(s.price)}</strong><button data-skin-action="${owned ? 'equip' : 'buy'}" data-id="${esc(s.id)}" ${equipped ? 'disabled' : ''}>${label}</button></article>`;
    }).join('');
    view.innerHTML = `<div class="online-view-heading"><div><h3>🎭 Skinwinkel</h3><p>Je saldo: ${econ.coins} LabCoins. Alleen uiterlijke aanpassingen.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><div class="online-store-grid">${cards}</div>`;
  }
  async function renderCards() {
    const [{ data: catalog, error: cErr }, { data: owned, error: oErr }, econ] = await Promise.all([
      supabase.from('card_catalog').select('id,name,formula,category,rarity,price,attack,shield,description').order('price'),
      supabase.from('user_cards').select('card_id').eq('user_id', currentUser.id), getEconomy()
    ]);
    if (cErr) throw cErr; if (oErr) throw oErr;
    const ownedIds = new Set((owned || []).map(x => x.card_id));
    const cards = (catalog || []).map(c => `<article class="online-card ${ownedIds.has(c.id) ? 'owned' : ''}"><div class="online-card-top"><span>${esc(c.category)}</span><span>${esc(c.rarity)}</span></div><div class="online-formula">${esc(c.formula)}</div><h4>${esc(c.name)}</h4><p>${esc(c.description)}</p><div class="online-stats"><span>⚔ ${Number(c.attack)}</span><span>🛡 ${Number(c.shield)}</span></div><button data-card-buy="${esc(c.id)}" ${ownedIds.has(c.id) ? 'disabled' : ''}>${ownedIds.has(c.id) ? '✓ In collectie' : `Koop · ${Number(c.price)} coins`}</button></article>`).join('');
    view.innerHTML = `<div class="online-view-heading"><div><h3>🃏 Kaartenwinkel</h3><p>Saldo: ${econ.coins} LabCoins. Kaarten gebruik je in battles.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><div class="online-store-grid online-card-grid">${cards}</div>`;
  }
  async function renderTeacher() {
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht heeft toegang tot klasbeheer.');
    const { students = [] } = await teacherFunction('teacher-list-students', { method: 'GET' });
    const studentRows = students.map(student => {
      const username = esc(student.username); const xp = Number(student.xp || 0); const level = Math.floor(xp / 100) + 1;
      return `<tr><td><strong>${username}</strong></td><td>${xp}</td><td>${level}</td><td><button type="button" class="teacher-delete-btn" data-teacher-delete-student="${username}">Verwijderen</button></td></tr>`;
    }).join('');
    view.innerHTML = `<div class="online-view-heading"><div><h3>🏫 Klasbeheer</h3><p>Accounts zijn gekoppeld aan jouw klas. Leerlingen kunnen zelf geen account registreren.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div>
      <div class="online-auth-layout"><article class="online-auth-card"><h3>Leerlingaccounts aanmaken</h3><p>Voer één leerling per regel in als <code>gebruikersnaam;wachtwoord</code>. De gebruikersnaam gebruikt 3–20 kleine letters, cijfers, _ of -. Wachtwoorden zijn minstens 8 tekens. Maximaal 30 per keer.</p><form id="teacher-create-accounts-form" class="online-form"><label for="teacher-student-lines">Leerlingen (gebruikersnaam;wachtwoord)</label><textarea id="teacher-student-lines" rows="8" placeholder="chemicus01;TijdelijkWachtwoord1
chemicus02;TijdelijkWachtwoord2" required></textarea><button type="submit" class="online-primary">Maak leerlingaccounts</button></form><div id="teacher-account-results" class="teacher-results hidden" aria-live="polite"></div></article>
      <article class="online-auth-card"><h3>Leerlingwachtwoord resetten</h3><p>Gebruik dit wanneer een leerling het wachtwoord vergeten is. Het nieuwe wachtwoord wordt onmiddellijk actief.</p><form id="teacher-reset-form" class="online-form"><label for="teacher-reset-username">Gebruikersnaam</label><input id="teacher-reset-username" pattern="[a-zA-Z0-9_-]{3,20}" required><label for="teacher-reset-password">Nieuw wachtwoord (minstens 8 tekens)</label><input id="teacher-reset-password" type="password" minlength="8" autocomplete="new-password" required><button type="submit" class="online-secondary">Reset wachtwoord</button></form><p class="teacher-warn">Deel tijdelijke wachtwoorden alleen rechtstreeks met de leerling. Zet ze niet in een publiek klasdocument.</p></article></div>
      <section class="teacher-student-list"><div class="online-view-heading"><div><h3>👥 Leerlingen in jouw klas</h3><p>${students.length} leerlingaccount${students.length === 1 ? '' : 's'} gevonden.</p></div></div><div class="online-table-wrap"><table class="online-table"><thead><tr><th>Gebruikersnaam</th><th>XP</th><th>Level</th><th>Accountbeheer</th></tr></thead><tbody>${studentRows || '<tr><td colspan="4">Er zijn nog geen leerlingaccounts in jouw klas.</td></tr>'}</tbody></table></div><p class="teacher-warn">Let op: verwijderen is definitief. Ook XP, LabCoins, kaarten, skins, sprintresultaten en battlegeschiedenis van die leerling worden verwijderd.</p></section>
      <section class="teacher-question-manager"><div class="online-view-heading"><div><h3>🧪 Vragenbeheer per leerjaar</h3><p>Elk leerjaar heeft een eigen vragenbank. Wijzigingen gelden voor leerlingen zodra ze de game opnieuw laden.</p></div></div>
        <div class="teacher-question-toolbar"><label for="teacher-question-level">Vragenset kiezen<select id="teacher-question-level">${LEVELS_FOR_QUESTIONS.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label></div>
        <div id="teacher-puzzle-settings" class="teacher-puzzle-settings"></div>
        <div id="teacher-question-status" class="teacher-question-status" role="status">Vragen worden geladen…</div><div id="teacher-question-list" class="teacher-question-grid"></div>
        <form id="teacher-question-form" class="teacher-question-form"><input id="teacher-question-id" type="hidden"><label for="teacher-question-object">Puzzelplek<select id="teacher-question-object"><option value="object1">Puzzelplek 1</option><option value="object2">Puzzelplek 2</option><option value="object3">Puzzelplek 3</option><option value="object4">Puzzelplek 4</option></select></label>
        <label for="teacher-question-difficulty">Moeilijkheid<select id="teacher-question-difficulty"><option value="basis">Basis</option><option value="gemiddeld">Gemiddeld</option><option value="moeilijk">Moeilijk</option></select></label>
        <label for="teacher-question-type">Vraagtype<select id="teacher-question-type"><option value="multiple_choice">Meerkeuzevraag</option><option value="numeric">Rekenvraag (geheel getal)</option></select></label>
        <label for="teacher-question-text" class="span-all">Vraag<textarea id="teacher-question-text" rows="3" maxlength="1000" required placeholder="Typ hier de vraag…"></textarea></label>
        <label for="teacher-question-options" id="teacher-question-options-wrap" class="span-all">Vier antwoordopties (één per regel)<textarea id="teacher-question-options" rows="4" placeholder="Optie A
Optie B
Optie C
Optie D"></textarea></label>
        <label for="teacher-question-answer" id="teacher-question-answer-label">Correct antwoord<select id="teacher-question-answer"><option value="1">Optie 1</option><option value="2">Optie 2</option><option value="3">Optie 3</option><option value="4">Optie 4</option></select></label>
        <div class="span-all" style="display:flex;gap:9px;flex-wrap:wrap"><button type="submit" class="online-primary" id="teacher-question-save">Vraag opslaan</button><button type="button" class="online-secondary" id="teacher-question-new">Nieuwe vraag / formulier leegmaken</button></div>
        <p class="teacher-question-status span-all">Label elke vraag als Basis, Gemiddeld of Moeilijk. Het aantal vragen (3, 5 of 10) stel je bovenaan per puzzelplek in. Zorg dat de gekozen moeilijkheid voldoende actieve vragen bevat.</p>
        </form></section>`;
    try { await renderTeacherQuestions('medieval'); } catch (questionError) { console.error(questionError); const status=document.getElementById('teacher-question-status'); if(status) status.textContent='Vragenbeheer is nog niet geactiveerd. Voer de SQL-migratie uit die in het updatepakket staat.'; const list=document.getElementById('teacher-question-list'); if(list) list.innerHTML='<p class="online-help">Voer eerst de meegeleverde Supabase-migratie uit om vragensets online te beheren.</p>'; }
  }

  function resetTeacherQuestionForm() {
    document.getElementById('teacher-question-form')?.reset();
    const id = document.getElementById('teacher-question-id'); if (id) id.value = '';
    const save = document.getElementById('teacher-question-save'); if (save) save.textContent = 'Vraag toevoegen';
    toggleQuestionEditorType();
  }
  function toggleQuestionEditorType() {
    const type = document.getElementById('teacher-question-type')?.value || 'multiple_choice';
    const opts = document.getElementById('teacher-question-options-wrap');
    const answer = document.getElementById('teacher-question-answer-label');
    if (opts) opts.classList.toggle('hidden', type !== 'multiple_choice');
    if (type === 'numeric' && answer) answer.innerHTML = '<span>Correct antwoord (geheel getal)</span><input id="teacher-question-answer" type="number" step="1" required placeholder="bv. 42">';
    if (type === 'multiple_choice' && answer) answer.innerHTML = '<span>Correct antwoord</span><select id="teacher-question-answer"><option value="1">Optie 1</option><option value="2">Optie 2</option><option value="3">Optie 3</option><option value="4">Optie 4</option></select>';
  }
  async function renderTeacherQuestions(level) {
    teacherQuestionLevel = level;
    const select = document.getElementById('teacher-question-level'); if (select) select.value = level;
    const status = document.getElementById('teacher-question-status');
    const list = document.getElementById('teacher-question-list');
    const settingsBox = document.getElementById('teacher-puzzle-settings');
    const levelConfig = LEVELS_FOR_QUESTIONS.find(item => item.id === level);
    const labels = levelConfig?.objects || { object1: 'Puzzelplek 1', object2: 'Puzzelplek 2', object3: 'Puzzelplek 3', object4: 'Puzzelplek 4' };
    const objectSelect = document.getElementById('teacher-question-object');
    if (objectSelect) {
      const selectedObject = objectSelect.value || 'object1';
      objectSelect.innerHTML = Object.entries(labels).map(([id,label]) => `<option value="${id}">${esc(label)}</option>`).join('');
      objectSelect.value = selectedObject in labels ? selectedObject : 'object1';
    }
    if (status) status.textContent = 'Vragen en instellingen worden opgehaald…';
    const [rows, settings] = await Promise.all([
      rpc('get_level_questions', { p_level_id: level }),
      rpc('get_level_puzzle_settings', { p_level_id: level })
    ]);
    teacherQuestionCache = Array.isArray(rows) ? rows : [];
    const settingsMap = Object.fromEntries((Array.isArray(settings) ? settings : []).map(row => [row.object_id, Number(row.questions_required)]));
    const difficulties = ['basis','gemiddeld','moeilijk'];
    const difficultyLabels = { basis:'Basis', gemiddeld:'Gemiddeld', moeilijk:'Moeilijk' };
    const counts = {};
    for (const objectId of Object.keys(labels)) {
      counts[objectId] = Object.fromEntries(difficulties.map(d => [d, teacherQuestionCache.filter(q => q.object_id === objectId && q.difficulty === d).length]));
    }
    if (settingsBox) settingsBox.innerHTML = `<h4>Aantal vragen per puzzel</h4><p>Dit aantal bepaalt de leerkracht. Leerlingen kiezen alleen de moeilijkheidsgraad.</p><div class="teacher-puzzle-settings-grid">${Object.entries(labels).map(([objectId,label]) => {
      const required = settingsMap[objectId] || 3;
      const tally = counts[objectId];
      return `<article class="teacher-puzzle-setting"><div><strong>${label}</strong><small>Basis: ${tally.basis} · Gemiddeld: ${tally.gemiddeld} · Moeilijk: ${tally.moeilijk}</small></div><label>Aantal vragen<select data-puzzle-count="${objectId}"><option value="3" ${required===3?'selected':''}>3 vragen</option><option value="5" ${required===5?'selected':''}>5 vragen</option><option value="10" ${required===10?'selected':''}>10 vragen</option></select></label></article>`;
    }).join('')}</div>`;
    const total = teacherQuestionCache.length;
    if (status) status.textContent = `${total} actieve vragen in ${LEVELS_FOR_QUESTIONS.find(l=>l.id===level)?.name || level}. Elke vraag behoort tot één puzzelplek én één moeilijkheidsgraad.`;
    if (list) list.innerHTML = teacherQuestionCache.map(q => {
      const answer = q.question_type === 'numeric' ? String(q.correct_answer) : (q.options?.[Number(q.correct_answer)] ?? '—');
      return `<article class="teacher-question-item"><small>${esc(labels[q.object_id] || q.object_id)} · ${q.question_type === 'numeric' ? 'Rekenvraag' : 'Meerkeuze'} · <b class="difficulty-tag difficulty-tag-${esc(q.difficulty)}">${esc(difficultyLabels[q.difficulty] || q.difficulty)}</b></small><p>${esc(q.question_text)}</p><small>Correct antwoord: <strong>${esc(answer)}</strong></small><div class="teacher-question-actions"><button type="button" data-q-edit="${esc(q.question_id)}">Bewerken</button><button type="button" class="danger" data-q-delete="${esc(q.question_id)}">Archiveren</button></div></article>`;
    }).join('') || '<p class="online-help">Nog geen vragen voor dit leerjaar.</p>';
    resetTeacherQuestionForm();
    return teacherQuestionCache;
  }
  function editTeacherQuestion(id) {
    const q = teacherQuestionCache.find(x=>x.question_id===id); if (!q) return;
    document.getElementById('teacher-question-id').value = q.question_id;
    document.getElementById('teacher-question-object').value = q.object_id;
    document.getElementById('teacher-question-difficulty').value = q.difficulty || 'basis';
    document.getElementById('teacher-question-type').value = q.question_type;
    document.getElementById('teacher-question-text').value = q.question_text;
    document.getElementById('teacher-question-options').value = (q.options || []).join('\n');
    toggleQuestionEditorType();
    const answer = document.getElementById('teacher-question-answer');
    if (answer) answer.value = q.question_type === 'numeric' ? q.correct_answer : Number(q.correct_answer)+1;
    const save = document.getElementById('teacher-question-save'); if (save) save.textContent = 'Wijzigingen opslaan';
    document.getElementById('teacher-question-form')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function handleTeacherQuestionSave(e) {
    e.preventDefault(); requireLogin();
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht kan vragen aanpassen.');
    const level = document.getElementById('teacher-question-level').value;
    const object = document.getElementById('teacher-question-object').value;
    const type = document.getElementById('teacher-question-type').value;
    const difficulty = document.getElementById('teacher-question-difficulty').value;
    const question = document.getElementById('teacher-question-text').value.trim();
    let options = [], answer;
    if (!question) throw new Error('Vul de vraagtekst in.');
    if (type === 'multiple_choice') {
      options = document.getElementById('teacher-question-options').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if (options.length !== 4) throw new Error('Een meerkeuzevraag moet precies vier niet-lege antwoordopties hebben.');
      const index = Number(document.getElementById('teacher-question-answer').value);
      if (!Number.isInteger(index) || index < 1 || index > 4) throw new Error('Kies het juiste antwoord uit optie 1 tot en met 4.');
      answer = index - 1;
    } else {
      answer = Number(document.getElementById('teacher-question-answer').value);
      if (!Number.isSafeInteger(answer)) throw new Error('Vul bij een rekenvraag een geheel getal in.');
    }
    let id = document.getElementById('teacher-question-id').value.trim();
    if (!id) id = `t_${level}_${(window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2,9)}`).replace(/-/g,'').slice(0,30)}`;
    await rpc('teacher_save_quiz_question', { p_question_id:id, p_level_id:level, p_object_id:object, p_question_text:question, p_options:options, p_correct_answer:answer, p_question_type:type, p_difficulty:difficulty });
    await renderTeacherQuestions(level);
    msg('De vraag is opgeslagen onder de gekozen puzzel en moeilijkheidsgraad.', 'good');
  }
  async function handleTeacherQuestionArchive(id) {
    requireLogin();
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht kan vragen archiveren.');
    const q = teacherQuestionCache.find(x=>x.question_id===id);
    if (!q) return;
    if (!window.confirm('Deze vraag archiveren? Ze verdwijnt uit de actieve vragenset, maar de historische XP-registratie blijft bewaard.')) return;
    await rpc('teacher_archive_quiz_question', { p_question_id:id });
    await renderTeacherQuestions(teacherQuestionLevel);
    msg('Vraag gearchiveerd.', 'good');
  }


  async function getMyBattles() { const data = await rpc('get_my_battles'); return Array.isArray(data) ? data : []; }
  async function renderBattles() {
    const [battles, { data: owned, error: oErr }, { data: catalog, error: cErr }] = await Promise.all([
      getMyBattles(), supabase.from('user_cards').select('card_id').eq('user_id', currentUser.id), supabase.from('card_catalog').select('id,name,formula,attack,shield,price,rarity,description')
    ]);
    if (oErr) throw oErr; if (cErr) throw cErr;
    const cards = catalog || [], ownedIds = new Set((owned || []).map(x => x.card_id));
    const battleMarkup = await Promise.all(battles.map(async b => {
      const isChallenger = b.challenger_id === currentUser.id;
      const opponentName = isChallenger ? b.opponent_username : b.challenger_username;
      const isMyTurn = b.current_turn === currentUser.id;
      let sub = '';
      if (b.status === 'pending' && b.opponent_id === currentUser.id) sub = `<div class="online-actions"><button data-battle-response="accept" data-id="${b.battle_id}">Uitdaging aanvaarden</button><button class="danger" data-battle-response="decline" data-id="${b.battle_id}">Weigeren</button></div>`;
      else if (b.status === 'pending') sub = '<p>Uitdaging verstuurd; wachten op antwoord.</p>';
      else if (b.status === 'declined') sub = '<p>Uitdaging geweigerd.</p>';
      else if (b.status === 'completed') sub = `<p>${b.winner_id ? (b.winner_id === currentUser.id ? '🏆 Jij hebt gewonnen!' : 'De tegenstander heeft gewonnen.') : '🤝 Gelijkspel'} </p>`;
      else if (b.status === 'active') {
        const { data: moves, error: mErr } = await supabase.from('battle_moves').select('move_number,user_id,card_id,damage,hp_after,created_at').eq('battle_id', b.battle_id).order('move_number');
        if (mErr) throw mErr;
        const used = new Set((moves || []).filter(m => m.user_id === currentUser.id).map(m => m.card_id));
        const moveList = (moves || []).map(m => {const c=cards.find(x=>x.id===m.card_id);return `<li><b>${m.move_number}.</b> ${esc(c?.name||m.card_id)} (${esc(c?.formula||'')}) · ${Number(m.damage)} schade</li>`}).join('');
        sub = `<p>${isMyTurn ? '<strong class="good">Jij bent aan zet.</strong>' : 'Tegenstander is aan zet.'} Ronde ${Number(b.turn_count)+1}/10.</p><div class="online-hp"><span>🧪 Jij: ${isChallenger ? b.challenger_hp : b.opponent_hp}/30 HP</span><span>⚗ ${esc(opponentName)}: ${isChallenger ? b.opponent_hp : b.challenger_hp}/30 HP</span></div><ol class="online-moves">${moveList || '<li>De battle is gestart.</li>'}</ol>${isMyTurn ? `<div class="online-hand"><strong>Kies een kaart:</strong><div class="online-hand-grid">${cards.filter(c=>ownedIds.has(c.id)&&!used.has(c.id)).map(c=>`<button class="online-play-card" data-play-card="${esc(c.id)}" data-battle-id="${b.battle_id}"><b>${esc(c.formula)}</b><span>${esc(c.name)}</span><small>⚔ ${c.attack} · 🛡 ${c.shield}</small></button>`).join('')}</div></div>` : ''}`;
      }
      return `<article class="online-battle-card"><div class="online-view-heading"><div><h4>⚔️ Jij vs. ${esc(opponentName)}</h4><small>${esc(b.status)} · ${new Date(b.updated_at).toLocaleString('nl-BE')}</small></div><span class="online-pill">${b.status === 'active' ? `${isChallenger ? b.challenger_hp : b.opponent_hp} HP` : esc(b.status)}</span></div>${sub}</article>`;
    }));
    view.innerHTML = `<div class="online-view-heading"><div><h3>⚔️ Chemiebattles</h3><p>Daag een klasgenoot uit met diens gebruikersnaam. Andere klassen zijn afgeschermd.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><form id="battle-invite-form" class="online-invite-form"><label for="battle-opponent">Gebruikersnaam tegenstander</label><input id="battle-opponent" name="username" minlength="3" maxlength="20" pattern="[a-z0-9_-]{3,20}" placeholder="bv. chemicus_123" required><button>Daag uit</button></form><div class="online-battles-list">${battleMarkup.join('') || '<p class="online-help">Nog geen uitdagingen of battles. Daag een klasgenoot uit!</p>'}</div>`;
  }
  async function action(task) {
    try { msg('Bezig…'); await task(); if (currentUser) { msg('Klaar.', 'good'); await loadProfile(); setView(currentView); } else { msg('Je bent afgemeld.', 'good'); } }
    catch (e) { console.error(e); msg(e.message || 'Er ging iets mis.', 'bad'); }
  }
  async function handleTeacherSetup(e) {
    if (e) e.preventDefault();
    const username = (document.getElementById('online-setup-username')?.value || '').trim().toLowerCase();
    const password = document.getElementById('online-setup-password')?.value || '';
    const className = (document.getElementById('online-setup-class')?.value || '').trim();
    const setupSecret = document.getElementById('online-setup-secret')?.value || '';
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) throw new Error('Gebruikersnaam: 3–20 tekens, kleine letters, cijfers, _ en - .');
    if (password.length < 10) throw new Error('Kies voor het leerkrachtaccount een wachtwoord van minstens 10 tekens.');
    if (className.length < 2 || className.length > 80 || !setupSecret) throw new Error('Vul een geldige klasnaam en de setupcode in.');
    const response = await fetch('/.netlify/functions/bootstrap-teacher', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-teacher-setup-secret': setupSecret }, body: JSON.stringify({ username, password, className }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Leerkrachtaccount aanmaken is mislukt. Controleer de Netlify-instellingen.');
    document.getElementById('online-setup-secret').value = '';
    document.getElementById('online-teacher-setup-form')?.reset();
    msg(`Leerkrachtaccount ${result.username} is aangemaakt voor klas ${result.className}. Log nu in met die gebruikersnaam en dat wachtwoord.`, 'good');
  }
  async function handleCreateStudentAccounts(e) {
    if (e) e.preventDefault();
    requireLogin();
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht kan leerlingaccounts aanmaken.');
    const raw = document.getElementById('teacher-student-lines')?.value || '';
    const students = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [username, ...pass] = line.split(';');
      return { username: (username || '').trim().toLowerCase(), password: pass.join(';').trim() };
    });
    if (!students.length) throw new Error('Voer minstens één regel in: gebruikersnaam;wachtwoord');
    if (students.length > 30) throw new Error('Maak maximaal 30 accounts per keer aan.');
    for (const student of students) {
      if (!/^[a-z0-9_-]{3,20}$/.test(student.username)) throw new Error(`Ongeldige gebruikersnaam: ${student.username}`);
      if (student.password.length < 8) throw new Error(`Wachtwoord voor ${student.username} moet minstens 8 tekens bevatten.`);
    }
    const duplicates = students.map(x => x.username).filter((x,i,a) => a.indexOf(x)!==i);
    if (duplicates.length) throw new Error(`Dubbele gebruikersnaam in je invoer: ${[...new Set(duplicates)].join(', ')}`);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Je sessie is verlopen. Log opnieuw in.');
    const response = await fetch('/.netlify/functions/teacher-create-students', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ students }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Leerlingaccounts aanmaken is mislukt.');
    const created = new Set((result.created || []).map(x => x.username));
    const report = students.filter(x => created.has(x.username)).map(x => `${x.username}  |  ${x.password}`).join('\n');
    const failed = (result.errors || []).map(x => `${x.username}: ${x.error}`).join('\n');
    const box = document.getElementById('teacher-account-results');
    if (box) { box.classList.remove('hidden'); box.textContent = `${result.created?.length || 0} account(s) aangemaakt. Bewaar deze inloggegevens en deel ze veilig uit:\n\n${report || '(geen nieuwe accounts)'}${failed ? `\n\nNiet gelukt:\n${failed}` : ''}`; }
    document.getElementById('teacher-student-lines').value = '';
    msg(`${result.created?.length || 0} leerlingaccount(s) aangemaakt.`, 'good');
  }
  async function handleTeacherPasswordReset(e) {
    if (e) e.preventDefault();
    requireLogin();
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht kan leerlingwachtwoorden resetten.');
    const username = (document.getElementById('teacher-reset-username')?.value || '').trim().toLowerCase();
    const password = document.getElementById('teacher-reset-password')?.value || '';
    if (!/^[a-z0-9_-]{3,20}$/.test(username) || password.length < 8) throw new Error('Controleer de gebruikersnaam en kies een wachtwoord van minstens 8 tekens.');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/teacher-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ username, password }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Wachtwoord resetten is mislukt.');
    document.getElementById('teacher-reset-form')?.reset();
    msg(`Wachtwoord voor ${username} is aangepast. Geef het nieuwe wachtwoord veilig door.`, 'good');
  }

  async function handleLogin() {
    const username = (document.getElementById('online-username')?.value || '').trim().toLowerCase();
    const password = document.getElementById('online-password')?.value || '';
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) throw new Error('Vul je gebruikersnaam in (3–20 tekens).');
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail(username), password });
    if (error) throw error;
    currentUser = data.user; await afterAuth(); msg('Je bent aangemeld.', 'good');
  }
  async function afterAuth() {
    showDashboard(); await loadProfile();
    try {
      const materials = await rpc('get_my_materials');
      window.ChemieGameBridge?.applyMaterials?.(materials);
    } catch (materialError) { console.warn('Grondstoffeninventaris kon niet worden geladen.', materialError); }
    try { const puzzleProgress = await rpc('get_my_puzzle_progress'); window.ChemieGameBridge?.applyOnlinePuzzleProgress?.(puzzleProgress); } catch (progressError) { console.warn('Puzzelvoortgang kon niet worden geladen.', progressError); }
    try { const levelUnlocks = await rpc('get_my_level_unlocks'); window.ChemieGameBridge?.applyOnlineLevelUnlocks?.(levelUnlocks); } catch (unlockError) { console.warn('Tijdpoortvoortgang kon niet worden geladen.', unlockError); }
    window.ChemieGameBridge?.onOnlineLogin?.();
    setView('home');
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => { if (currentUser && currentView === 'battles' && !view?.querySelector(':focus')) { try { await renderBattles(); } catch(e) { console.warn(e); } } }, 8000);
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut(); if (error) throw error;
    currentUser = null; currentProfile = null; showAuth(); msg('Je bent afgemeld.');
    if (refreshTimer) clearInterval(refreshTimer);
    if (window.ChemieGameBridge) {
      window.ChemieGameBridge.applyOnlineEconomy({ coins: 0, ownedSkins: ['starter'], equippedSkin: 'starter' });
      window.ChemieGameBridge.clearMaterials?.();
      window.ChemieGameBridge.clearOnlinePuzzleProgress?.();
      window.ChemieGameBridge.onOnlineLogout?.();
    }
  }
  async function handleClick(e) {
    const viewButton = e.target.closest('[data-online-view]'); if (viewButton) { setView(viewButton.dataset.onlineView); return; }
    const qEdit = e.target.closest('[data-q-edit]'); if (qEdit) { editTeacherQuestion(qEdit.dataset.qEdit); return; }
    const deleteStudent = e.target.closest('[data-teacher-delete-student]');
    if (deleteStudent) {
      const username = deleteStudent.dataset.teacherDeleteStudent;
      const confirmed = window.confirm(`Leerlingaccount '${username}' definitief verwijderen? Alle XP, LabCoins, kaarten, skins en spelgeschiedenis verdwijnen ook. Dit kan niet ongedaan worden gemaakt.`);
      if (!confirmed) return;
      await action(async () => { await teacherFunction('teacher-delete-student', { body: { username } }); msg(`Leerlingaccount '${username}' is verwijderd.`, 'good'); });
      return;
    }
    const qDelete = e.target.closest('[data-q-delete]'); if (qDelete) { try { await handleTeacherQuestionArchive(qDelete.dataset.qDelete); } catch(err) { console.error(err); msg(err.message || 'Vraag archiveren is mislukt.', 'bad'); } return; }
    if (e.target.closest('#teacher-question-new')) { resetTeacherQuestionForm(); return; }
    if (e.target.closest('[data-online-refresh]')) { await action(async () => { await refreshDashboard(); }); return; }
    if (e.target.closest('[data-online-logout]')) { await action(signOut); return; }
    const skin = e.target.closest('[data-skin-action]'); if (skin) { await action(async () => { if (skin.dataset.skinAction === 'buy') await rpc('buy_skin', { p_skin_id: skin.dataset.id }); else await rpc('equip_skin', { p_skin_id: skin.dataset.id }); }); return; }
    const card = e.target.closest('[data-card-buy]'); if (card) { await action(async () => { await rpc('buy_card', { p_card_id: card.dataset.cardBuy }); }); return; }
    const response = e.target.closest('[data-battle-response]'); if (response) { await action(async () => { await rpc('respond_to_battle', { p_battle_id: response.dataset.id, p_accept: response.dataset.battleResponse === 'accept' }); }); return; }
    const play = e.target.closest('[data-play-card]'); if (play) { await action(async () => { await rpc('play_battle_card', { p_battle_id: play.dataset.battleId, p_card_id: play.dataset.playCard }); }); return; }
  }
  function bindEvents() {
    root?.addEventListener('click', e => { handleClick(e).catch(err => { console.error(err); msg(err.message || 'Er ging iets mis.', 'bad'); }); });
    document.getElementById('online-login')?.addEventListener('click', () => action(handleLogin));
    document.getElementById('online-auth-form')?.addEventListener('submit', e => { e.preventDefault(); action(handleLogin); });
    document.getElementById('online-teacher-setup-form')?.addEventListener('submit', e => action(() => handleTeacherSetup(e)));
    view?.addEventListener('submit', e => {
      if (e.target.id === 'teacher-create-accounts-form') { action(() => handleCreateStudentAccounts(e)); return; }
      if (e.target.id === 'teacher-reset-form') { action(() => handleTeacherPasswordReset(e)); return; }
      if (e.target.id === 'teacher-question-form') { e.preventDefault(); handleTeacherQuestionSave(e).catch(err => { console.error(err); msg(err.message || 'Vraag opslaan is mislukt.', 'bad'); }); return; }
    });
    view?.addEventListener('change', e => {
      if (e.target.id === 'teacher-question-level') renderTeacherQuestions(e.target.value).catch(err => { console.error(err); msg(err.message || 'Vragenset laden is mislukt.', 'bad'); });
      if (e.target.id === 'teacher-question-type') toggleQuestionEditorType();
      if (e.target.matches('[data-puzzle-count]')) action(async () => {
        const objectId = e.target.dataset.puzzleCount, required = Number(e.target.value);
        await rpc('teacher_set_puzzle_questions', { p_level_id: teacherQuestionLevel, p_object_id: objectId, p_questions_required: required });
        msg(`${required} vragen ingesteld voor ${objectId}.`, 'good');
        await renderTeacherQuestions(teacherQuestionLevel);
      });
    });
    document.getElementById('online-logout')?.addEventListener('click', () => action(signOut));
    view?.addEventListener('submit', e => {
      if (e.target.id !== 'battle-invite-form') return;
      e.preventDefault(); const username = (document.getElementById('battle-opponent')?.value || '').trim().toLowerCase();
      action(async () => { await rpc('create_battle', { p_opponent_username: username }); });
    });
  }

  // Compatibility API used by the existing escape-room game.
  window.ChemieOnline = {
    isAuthenticated: () => Boolean(currentUser),
    async startPuzzleAttempt(levelId, objectId, difficulty) { requireLogin(); return rpc('start_puzzle_attempt', { p_level_id: levelId, p_object_id: objectId, p_difficulty: difficulty }); },
    async getActivePuzzleAttempt(levelId, objectId) { requireLogin(); return rpc('get_my_active_puzzle_attempt', { p_level_id: levelId, p_object_id: objectId }); },
    async unlockLevel(levelId, code) { requireLogin(); return rpc('unlock_level_with_code', { p_target_level: levelId, p_code: code }); },
    async submitPuzzleAnswer(attemptId, questionId, answer) {
      requireLogin();
      const result = await rpc('submit_puzzle_attempt_answer', { p_attempt_id: attemptId, p_question_id: questionId, p_answer: answer });
      if (result?.completed && result?.coins_awarded) result.economy = await getEconomy();
      return result;
    },
    async getMaterials() { requireLogin(); return rpc('get_my_materials'); },
    async startShadowEncounter(levelId) { requireLogin(); return rpc('start_shadow_encounter', { p_level_id: levelId }); },
    async collectShadowDrop(encounterId) { requireLogin(); return rpc('collect_shadow_drop', { p_encounter_id: encounterId }); },
    async blowSafe() {
      requireLogin();
      const result = await rpc('blow_safe');
      if (result?.ok) result.economy = await getEconomy();
      return result;
    },
    async startSprint() { requireLogin(); return rpc('start_element_sprint'); },
    async submitSprintAnswer(sessionId, elementName, symbol) { requireLogin(); return rpc('submit_element_answer', { p_session_id: sessionId, p_element_name: elementName, p_symbol: symbol }); },
    async finishSprint(sessionId) { requireLogin(); return rpc('finish_element_sprint', { p_session_id: sessionId }); },
    async startAcidSprint() { requireLogin(); return rpc('start_acid_sprint'); },
    async submitAcidSprintAnswer(sessionId, sequenceNumber, answer) { requireLogin(); return rpc('submit_acid_sprint_answer', { p_session_id: sessionId, p_sequence_number: sequenceNumber, p_answer: answer }); },
    async finishAcidSprint(sessionId) { requireLogin(); return rpc('finish_acid_sprint', { p_session_id: sessionId }); },
    async buySkin(id) { await rpc('buy_skin', { p_skin_id: id }); const economy = await getEconomy(); return { ok: true, action: 'buy', economy }; },
    async equipSkin(id) { await rpc('equip_skin', { p_skin_id: id }); const economy = await getEconomy(); return { ok: true, action: 'equip', economy }; },
    refreshDashboardSoon() { setTimeout(() => { if (currentUser) refreshDashboard().catch(console.error); }, 350); },
    getClient: () => supabase
  };

  if (!configured || !window.supabase?.createClient) {
    notice?.classList.remove('hidden');
    notice.innerHTML = 'Onlinefuncties zijn nog niet geconfigureerd. Voeg eerst de Supabase Project URL en publieke anon key toe in <code>config.js</code>, voer daarna <code>supabase/schema.sql</code> uit in de Supabase SQL Editor en deploy opnieuw via Netlify.';
    authBox?.classList.add('hidden'); dashboard?.classList.add('hidden');
    bindEvents();
    return;
  }
  notice?.classList.add('hidden');
  supabase = window.supabase.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  bindEvents();
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) { msg(error.message, 'bad'); return; }
    currentUser = data.session?.user || null;
    if (currentUser) { try { await afterAuth(); } catch(e) { console.error(e); showAuth(); msg(e.message || 'Account laden is mislukt.', 'bad'); } }
    else showAuth();
  });
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const nextUser = session?.user || null;
    if (nextUser?.id !== currentUser?.id) {
      currentUser = nextUser;
      if (currentUser) { try { await afterAuth(); } catch(e) { console.error(e); msg(e.message || 'Account laden is mislukt.', 'bad'); } }
      else showAuth();
    }
  });
})();
