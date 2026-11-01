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
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const msg = (text, kind = '') => { if (authStatus) { authStatus.textContent = text; authStatus.className = `online-status ${kind}`; } };
  const configured = Boolean(config.url && config.anonKey && !/VUL|YOUR_|PASTE/i.test(config.url + config.anonKey));
  const rpc = async (name, args = {}) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const requireLogin = () => { if (!currentUser) throw new Error('Meld je eerst aan om deze functie te gebruiken.'); };

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
    view.innerHTML = `<div class="online-home-grid"><article class="online-mini-card"><span>⭐</span><strong>${xp} XP</strong><small>${rem}/100 XP tot level ${level + 1}</small><div class="online-xp-bar"><i style="width:${rem}%"></i></div></article><article class="online-mini-card"><span>🪙</span><strong>${Number(currentProfile.coins)} LabCoins</strong><small>Verdien coins met de Elementensprint.</small></article><article class="online-mini-card"><span>🧬</span><strong>Kaartenbataljon</strong><small>Koop stofkaarten en daag een klasgenoot uit.</small></article></div><p class="online-help">De gewone puzzels geven XP. LabCoins verdien je via de optionele Elementensprint. Met coins koop je kaarten en skins. De ranking en battles zijn beperkt tot jouw klas.</p>`;
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
    view.innerHTML = `<div class="online-view-heading"><div><h3>🏫 Klasbeheer</h3><p>Accounts zijn gekoppeld aan jouw klas. Leerlingen kunnen zelf geen account registreren.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div>
      <div class="online-auth-layout"><article class="online-auth-card"><h3>Leerlingaccounts aanmaken</h3><p>Voer één leerling per regel in als <code>gebruikersnaam;wachtwoord</code>. De gebruikersnaam gebruikt 3–20 kleine letters, cijfers, _ of -. Wachtwoorden zijn minstens 8 tekens. Maximaal 30 per keer.</p><form id="teacher-create-accounts-form" class="online-form"><label for="teacher-student-lines">Leerlingen (gebruikersnaam;wachtwoord)</label><textarea id="teacher-student-lines" rows="8" placeholder="chemicus01;TijdelijkWachtwoord1
chemicus02;TijdelijkWachtwoord2" required></textarea><button type="submit" class="online-primary">Maak leerlingaccounts</button></form><div id="teacher-account-results" class="teacher-results hidden" aria-live="polite"></div></article>
      <article class="online-auth-card"><h3>Leerlingwachtwoord resetten</h3><p>Gebruik dit wanneer een leerling het wachtwoord vergeten is. Het nieuwe wachtwoord wordt onmiddellijk actief.</p><form id="teacher-reset-form" class="online-form"><label for="teacher-reset-username">Gebruikersnaam</label><input id="teacher-reset-username" pattern="[a-zA-Z0-9_-]{3,20}" required><label for="teacher-reset-password">Nieuw wachtwoord (minstens 8 tekens)</label><input id="teacher-reset-password" type="password" minlength="8" autocomplete="new-password" required><button type="submit" class="online-secondary">Reset wachtwoord</button></form><p class="teacher-warn">Deel tijdelijke wachtwoorden alleen rechtstreeks met de leerling. Zet ze niet in een publiek klasdocument.</p></article></div>`;
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
    showDashboard(); await loadProfile(); setView('home');
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => { if (currentUser && currentView === 'battles' && !view?.querySelector(':focus')) { try { await renderBattles(); } catch(e) { console.warn(e); } } }, 8000);
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut(); if (error) throw error;
    currentUser = null; currentProfile = null; showAuth(); msg('Je bent afgemeld.');
    if (refreshTimer) clearInterval(refreshTimer);
    if (window.ChemieGameBridge) window.ChemieGameBridge.applyOnlineEconomy({ coins: 0, ownedSkins: ['starter'], equippedSkin: 'starter' });
  }
  async function handleClick(e) {
    const viewButton = e.target.closest('[data-online-view]'); if (viewButton) { setView(viewButton.dataset.onlineView); return; }
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
    async recordQuizAnswer(questionId, answer) { requireLogin(); return rpc('record_quiz_answer', { p_question_id: questionId, p_answer: answer }); },
    async startSprint() { requireLogin(); return rpc('start_element_sprint'); },
    async submitSprintAnswer(sessionId, elementName, symbol) { requireLogin(); return rpc('submit_element_answer', { p_session_id: sessionId, p_element_name: elementName, p_symbol: symbol }); },
    async finishSprint(sessionId) { requireLogin(); return rpc('finish_element_sprint', { p_session_id: sessionId }); },
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
