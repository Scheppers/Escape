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
  const LABCOIN_ICON = '<svg class="labcoin-coin-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="13.4" fill="#f5c85c" stroke="#9a681c" stroke-width="1.5"/><circle cx="16" cy="16" r="10.2" fill="none" stroke="#fff0a3" stroke-width="1.4"/><path d="M16 9.6l1.9 4.1 4.5.5-3.3 3 1 4.4-4.1-2.2-4.1 2.2 1-4.4-3.3-3 4.5-.5z" fill="#936015"/></svg>';
  const AUTH_DOMAIN = 'accounts.chemieescape.invalid';
  const authEmail = (username) => `${String(username || '').trim().toLowerCase()}@${AUTH_DOMAIN}`;
  let refreshTimer = null, lastBattleIds = '';
  let teacherQuestionCache = [], teacherQuestionLevel = 'medieval';
  let teacherClassCache = [], teacherLeaderboardClassId = null, teacherCreateClassId = null;
  let cardCatalogCache = [], ownedCardCache = [], reactionCache = [], cardShopTab = 'shop';
  let teacherCardCache = [], teacherReactionCache = [];
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
    { id: 'medieval', name: 'Leerjaar 1 · Middeleeuws labo', objects: { object1:'Scheidingstechnieken', object2:'Aspecten en wetten', object3:'Atoommodellen', object4:'De chemische binding' } },
    { id: 'lavoisier', name: 'Leerjaar 2 · Lavoisierlabo', objects: { object1:'Reacties in waterig midden', object2:'Kwantitatieve aspecten', object3:'Koolstofchemie', object4:'Redoxreacties' } },
    { id: 'modern', name: 'Leerjaar 3 · Modern labo', objects: { object1:'Chemisch evenwicht', object2:'pH van een oplossing', object3:'Redoxreacties', object4:'Elektronenconfiguratie' } },
    { id: 'future', name: 'Leerjaar 4 · Futuristisch labo', objects: { object1:'Koolwaterstoffen', object2:'Monofunctionele verbindingsklassen', object3:'Polyfunctionele verbindingsklassen', object4:'Kunststoffen' } }
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
    window.ChemieGameBridge?.setTeacherMode?.(data.role === 'teacher');
    const teacherNav = document.getElementById('online-teacher-nav');
    teacherNav?.classList.toggle('hidden', data.role !== 'teacher');
    nav?.querySelectorAll('[data-online-view="cards"],[data-online-view="skins"],[data-online-view="battles"]').forEach(b => b.classList.toggle('hidden', data.role === 'teacher'));
    const level = Math.floor(Number(data.xp) / 100) + 1;
    summary.innerHTML = `<div class="online-profile"><span class="online-avatar">${esc((window.ChemieGameBridge?.getEconomyState?.().equippedSkin === 'brass') ? '🥽' : '🧪')}</span><div class="online-profile-copy"><strong>${esc(data.username)}</strong><small>Level ${level} · ${Number(data.xp)} XP</small></div><div class="online-currency"><span class="online-currency-amount">${LABCOIN_ICON} ${Number(data.coins)}</span><small>LabCoins</small></div></div>`;
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
    try { await loadProfile(); if (currentView === 'leaderboard') await renderLeaderboard(); else if (currentView === 'cards') await renderCards(); else if (currentView === 'skins') await renderSkins(); else if (currentView === 'battles') await renderBattles(); else if (currentView === 'teacher') await renderTeacher(); }
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
      view.innerHTML = `<div class="online-home-grid"><article class="online-mini-card"><span>🏫</span><strong>Klasbeheer</strong><small>Beheer meerdere klassen, verdeel leerlingen en reset wachtwoorden.</small></article><article class="online-mini-card"><span>🏆</span><strong>XP-ranking per klas</strong><small>Kies zelf welke klasrangschikking je wilt bekijken.</small></article><article class="online-mini-card"><span>🔐</span><strong>Geen zelfregistratie</strong><small>Leerlingen kunnen alleen inloggen met een account dat jij aanmaakt.</small></article></div><p class="online-help">De leerkracht beheert meerdere klassen. Leerlingen zien alleen de gebruikersnamen en XP van hun eigen klas; battles zijn uitsluitend mogelijk met klasgenoten.</p>`;
      return;
    }
    view.innerHTML = `<div class="online-home-grid"><article class="online-mini-card"><span>⭐</span><strong>${xp} XP</strong><small>${rem}/100 XP tot level ${level + 1}</small><div class="online-xp-bar"><i style="width:${rem}%"></i></div></article><article class="online-mini-card"><span class="labcoin-mini-icon">${LABCOIN_ICON}</span><strong>${Number(currentProfile.coins)} LabCoins</strong><small>Verdien coins met de Elementensprint, de Zurenkennis-sprint, The OG of chemistry en de virtuele kluisreactie.</small></article><article class="online-mini-card"><span>🧬</span><strong>Kaartenbataljon</strong><small>Koop stofkaarten en daag een klasgenoot uit.</small></article></div><p class="online-help">De gewone puzzels geven XP. LabCoins verdien je via de optionele Elementensprint, de Zurenkennis-sprint, The OG of chemistry en de virtuele kluisreactie. Met coins koop je kaarten en skins. De ranking en battles zijn beperkt tot jouw klas.</p>`;
  }
  async function renderLeaderboard() {
    let rows = [], classFilter = '';
    if (currentProfile?.role === 'teacher') {
      const data = await teacherFunction('teacher-list-students', { method: 'GET' });
      teacherClassCache = data.classes || [];
      if (!teacherClassCache.length) {
        view.innerHTML = '<h3>🏆 XP-ranking</h3><p class="online-help">Maak eerst minstens één klas aan in Klasbeheer.</p>';
        return;
      }
      if (!teacherClassCache.some(c => c.id === teacherLeaderboardClassId)) teacherLeaderboardClassId = teacherClassCache[0].id;
      const options = teacherClassCache.map(c => `<option value="${esc(c.id)}" ${c.id === teacherLeaderboardClassId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      classFilter = `<label class="teacher-ranking-filter">Ranking van klas<select id="teacher-ranking-class">${options}</select></label>`;
      rows = await rpc('get_leaderboard', { p_limit: 50, p_class_id: teacherLeaderboardClassId });
    } else {
      rows = await rpc('get_leaderboard', { p_limit: 20, p_class_id: null });
    }
    const table = `<div class="online-table-wrap"><table class="online-table"><thead><tr><th>#</th><th>Speler</th><th>Level</th><th>XP</th></tr></thead><tbody>${(rows || []).map(r => `<tr class="${r.username === currentProfile?.username ? 'is-me' : ''}"><td>${Number(r.position)}</td><td>${esc(r.username)}${r.username === currentProfile?.username ? ' (jij)' : ''}</td><td>${Number(r.level)}</td><td>${Number(r.xp)}</td></tr>`).join('') || '<tr><td colspan="4">Nog geen rankinggegevens voor deze klas.</td></tr>'}</tbody></table></div>`;
    view.innerHTML = `<div class="online-view-heading"><div><h3>🏆 XP-ranking</h3><p>${currentProfile?.role === 'teacher' ? 'Kies een klas om de rangschikking van die leerlingen te bekijken.' : 'Alleen leerlingen uit jouw klas zijn zichtbaar.'}</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div>${classFilter}${table}`;
  }
  async function renderSkins() {
    const [{ data: catalog, error: cErr }, econ] = await Promise.all([
      supabase.from('skin_catalog').select('id,name,emoji,price,description').order('price'), getEconomy()
    ]);
    if (cErr) throw cErr;
    const cards = (catalog || []).map(s => {
      const owned = econ.ownedSkins.includes(s.id), equipped = econ.equippedSkin === s.id;
      let label = equipped ? '✓ Uitgerust' : owned ? 'Uitrusten' : `Koop · ${s.price} coins`;
      return `<article class="online-store-card"><div class="online-store-emoji">${esc(s.emoji)}</div><h4>${esc(s.name)}</h4><p>${esc(s.description)}</p><strong>${LABCOIN_ICON} ${Number(s.price)}</strong><button data-skin-action="${owned ? 'equip' : 'buy'}" data-id="${esc(s.id)}" ${equipped ? 'disabled' : ''}>${label}</button></article>`;
    }).join('');
    view.innerHTML = `<div class="online-view-heading"><div><h3>🎭 Skinwinkel</h3><p>Je saldo: ${econ.coins} LabCoins. Alleen uiterlijke aanpassingen.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><div class="online-store-grid">${cards}</div>`;
  }
  async function renderCards() {
    const [{ data: catalog, error: cErr }, { data: owned, error: oErr }, { data: reactions, error: rErr }, econ] = await Promise.all([
      supabase.from('card_catalog').select('id,name,formula,category,rarity,price,attack,shield,description,card_type,power,support_target_type,support_effect,support_description,is_shop_item,is_reward_only,is_final_reward').order('price'),
      supabase.from('user_cards').select('card_id,quantity').eq('user_id', currentUser.id),
      supabase.from('card_reactions').select('id,name,reactant_a_id,reactant_a_qty,reactant_b_id,reactant_b_qty,product_a_id,product_a_qty,product_b_id,product_b_qty,equation_text,active').eq('active', true).order('name'),
      getEconomy()
    ]);
    if (cErr) throw cErr; if (oErr) throw oErr; if (rErr) throw rErr;
    cardCatalogCache = catalog || []; ownedCardCache = owned || []; reactionCache = reactions || [];
    renderCardsPanel(econ);
  }
  function renderCardsPanel(econ = null) {
    const ownedMap = new Map(ownedCardCache.map(row => [row.card_id, Number(row.quantity) || 0]));
    const ownedCards = cardCatalogCache.filter(c => (ownedMap.get(c.id) || 0) > 0);
    const reactionCards = ownedCards.filter(c => !c.is_final_reward && String(c.formula).trim().toUpperCase() !== 'AU');
    const tabs = `<div class="card-system-tabs"><button type="button" data-card-tab="shop" class="${cardShopTab==='shop'?'active':''}">🛍️ Winkel</button><button type="button" data-card-tab="collection" class="${cardShopTab==='collection'?'active':''}">📚 Mijn collectie</button><button type="button" data-card-tab="reactor" class="${cardShopTab==='reactor'?'active':''}">⚗️ Reactiekamer</button></div>`;
    let body = '';
    // Card IDs moeten ook beschikbaar zijn nadat de reactiekamer-HTML is opgebouwd.
    // Ze stonden eerder binnen de else-scope en waren daardoor hieronder niet bereikbaar.
    let firstCardId = '';
    let secondCardId = '';
    if (cardShopTab === 'shop') {
      const shop = cardCatalogCache.filter(c => c.is_shop_item && !c.is_reward_only && String(c.formula).trim().toUpperCase() !== 'AU');
      body = `<p class="online-help">Koop kaarten van enkelvoudige stoffen. Je mag meerdere exemplaren van dezelfde kaart bezitten. Samengestelde stoffen maak je in de reactiekamer.</p><div class="online-store-grid online-card-grid">${shop.map(c => {
        const quantity = ownedMap.get(c.id) || 0;
        return `<article class="online-card"><div class="online-card-top"><span>${esc(c.card_type || c.category)}</span><span>${esc(c.rarity)}</span></div><div class="online-formula">${esc(c.formula)}</div><h4>${esc(c.name)}</h4><p>${esc(c.description)}</p><div class="online-stats"><span>💪 Kracht ${Number(c.power ?? c.attack)}</span><span>📦 ${quantity} in bezit</span></div><button data-card-buy="${esc(c.id)}">Koop exemplaar · ${Number(c.price)} ${LABCOIN_ICON}</button></article>`;
      }).join('') || '<p class="online-help">De leerkracht heeft nog geen winkelkaarten geactiveerd.</p>'}</div>`;
    } else if (cardShopTab === 'collection') {
      body = `<p class="online-help">Je verzameling bevat ${ownedCards.reduce((sum,c)=>sum+(ownedMap.get(c.id)||0),0)} kaart(en). Dubbele kaarten tellen als aparte exemplaren. De exclusieve tijdreisbeloning is niet te koop en niet bruikbaar in reacties, maar kan wel in een battledeck.</p><div class="online-store-grid online-card-grid">${ownedCards.map(c => `<article class="online-card owned"><div class="online-card-top"><span>${esc(c.card_type || c.category)}</span><span>${esc(c.rarity)}</span></div><div class="online-formula">${esc(c.formula)}</div><h4>${esc(c.name)}</h4><p>${esc(c.description)}</p><div class="online-stats"><span>💪 Kracht ${Number(c.power ?? c.attack)}</span><span>📦 ×${ownedMap.get(c.id)}</span></div>${c.support_effect && c.support_effect !== 'none' ? `<small class="card-support">✨ ${esc(c.support_description || 'Speciale ondersteuning')}</small>` : ''}${c.is_final_reward ? '<span class="card-reward-tag final-reward-tag">🏆 Exclusieve tijdreisbeloning · niet te koop of inzetbaar in reacties · wel inzetbaar in battles</span>' : String(c.formula).trim() === 'Au' ? '<span class="card-reward-tag">Oude Au-kaart · niet langer te koop of inzetbaar in nieuwe battles</span>' : c.is_reward_only ? '<span class="card-reward-tag">🏆 Exclusieve battlekaart</span>' : ''}</article>`).join('') || '<p class="online-help">Je collectie is nog leeg. Koop eerst enkele enkelvoudige stoffen in de winkel.</p>'}</div>`;
    } else {
      const ownedOptions = reactionCards.map(c => `<option value="${esc(c.id)}">${esc(c.formula)} · ${esc(c.name)} (bezit: ${ownedMap.get(c.id)})</option>`).join('');
      firstCardId = reactionCards[0]?.id || '';
      secondCardId = reactionCards.find(c => c.id !== firstCardId)?.id || '';
      body = `<p class="online-help">Kies twee verschillende beginstoffen. De reactiekamer zoekt de bijbehorende reactie en gebruikt precies de coëfficiënten uit de reactievergelijking. Het reactieproduct of de reactieproducten komen daarna in je collectie.</p>
        <div class="reaction-builder"><label>Beginstof 1<select id="reaction-card-a" data-reaction-selector>${ownedOptions}</select></label><label>Beginstof 2<select id="reaction-card-b" data-reaction-selector>${ownedOptions}</select></label><div id="reaction-preview" class="reaction-preview"></div><button type="button" class="online-primary" id="reaction-run" disabled>Voer reactie uit</button></div>`;
      if (!reactionCards.length) body = `<p class="online-help">Je hebt nog geen beginstoffen om te laten reageren. Koop eerst twee soorten enkelvoudige stoffen in de winkel.</p>`;
      else if (reactionCards.length < 2) body = `<p class="online-help">Je hebt minstens twee verschillende soorten beginstoffen nodig om een reactie te starten.</p>`;
    }
    const balance = econ?.coins ?? currentProfile?.coins ?? 0;
    view.innerHTML = `<div class="online-view-heading"><div><h3>🃏 Stoffenwinkel & kaartencollectie</h3><p>Je saldo: ${Number(balance)} LabCoins.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div>${tabs}<div class="card-system-body">${body}</div>`;
    if (cardShopTab === 'reactor' && reactionCards.length >= 2) {
      const a = document.getElementById('reaction-card-a'), b = document.getElementById('reaction-card-b');
      if (a) a.value = firstCardId; if (b) b.value = secondCardId;
      renderReactionPreview();
    }
  }
  function renderReactionPreview() {
    const a = document.getElementById('reaction-card-a')?.value;
    const b = document.getElementById('reaction-card-b')?.value;
    const preview = document.getElementById('reaction-preview');
    const run = document.getElementById('reaction-run');
    if (!preview || !run) return;
    const reaction = reactionCache.find(r => (r.reactant_a_id === a && r.reactant_b_id === b) || (r.reactant_a_id === b && r.reactant_b_id === a));
    if (!reaction) { preview.innerHTML = '<p>Er is nog geen reactie ingesteld voor deze combinatie. Vraag de leerkracht om deze reactie toe te voegen.</p>'; run.disabled = true; run.dataset.reactionId = ''; return; }
    const byId = new Map(cardCatalogCache.map(c => [c.id,c]));
    const amountA = ownedCardCache.find(x=>x.card_id===reaction.reactant_a_id)?.quantity || 0;
    const amountB = ownedCardCache.find(x=>x.card_id===reaction.reactant_b_id)?.quantity || 0;
    const productA = byId.get(reaction.product_a_id), productB = reaction.product_b_id ? byId.get(reaction.product_b_id) : null;
    const enough = amountA >= reaction.reactant_a_qty && amountB >= reaction.reactant_b_qty;
    preview.innerHTML = `<h4>${esc(reaction.name)}</h4><div class="reaction-equation-card">${esc(reaction.equation_text || `${reaction.reactant_a_qty} ${byId.get(reaction.reactant_a_id)?.formula || ''} + ${reaction.reactant_b_qty} ${byId.get(reaction.reactant_b_id)?.formula || ''}`)}</div><p>Je verbruikt ${reaction.reactant_a_qty} × ${esc(byId.get(reaction.reactant_a_id)?.formula || '')} en ${reaction.reactant_b_qty} × ${esc(byId.get(reaction.reactant_b_id)?.formula || '')}.</p><p>Je ontvangt ${reaction.product_a_qty} × ${esc(productA?.formula || '')}${productB ? ` en ${reaction.product_b_qty} × ${esc(productB.formula)}` : ''}.</p><small class="${enough?'good':'teacher-warn'}">${enough ? 'Je hebt voldoende kaarten.' : `Onvoldoende voorraad. Je bezit ${amountA} en ${amountB} van de benodigde beginstoffen.`}</small>`;
    run.disabled = !enough; run.dataset.reactionId = reaction.id;
  }
  async function renderTeacher() {
    if (currentProfile?.role !== 'teacher') throw new Error('Alleen de leerkracht heeft toegang tot klasbeheer.');
    const { students = [], classes = [] } = await teacherFunction('teacher-list-students', { method: 'GET' });
    teacherClassCache = classes;
    if (!teacherClassCache.some(c => c.id === teacherCreateClassId)) teacherCreateClassId = teacherClassCache.find(c => c.id === currentProfile.class_id)?.id || teacherClassCache[0]?.id || '';
    const selectedClassOptions = teacherClassCache.map(c => `<option value="${esc(c.id)}" ${c.id === teacherCreateClassId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const counts = new Map(teacherClassCache.map(c => [c.id, 0]));
    students.forEach(student => counts.set(student.class_id, (counts.get(student.class_id) || 0) + 1));
    const classCards = teacherClassCache.map(c => `<article class="teacher-class-card"><strong>🏫 ${esc(c.name)}</strong><span>${counts.get(c.id) || 0} leerling(en)</span></article>`).join('');
    const studentRows = students.map(student => {
      const username = esc(student.username); const xp = Number(student.xp || 0); const level = Math.floor(xp / 100) + 1;
      const moveOptions = teacherClassCache.map(c => `<option value="${esc(c.id)}" ${c.id === student.class_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      return `<tr><td><strong>${username}</strong></td><td>${esc(student.class_name || 'Onbekende klas')}</td><td>${xp}</td><td>${level}</td><td><div class="teacher-student-class-action"><select data-student-class-select="${username}" aria-label="Nieuwe klas voor ${username}">${moveOptions}</select><button type="button" class="online-small-btn" data-teacher-move-student="${username}">Verplaats</button></div></td><td><button type="button" class="teacher-delete-btn" data-teacher-delete-student="${username}">Verwijderen</button></td></tr>`;
    }).join('');
    view.innerHTML = `<div class="online-view-heading"><div><h3>🏫 Klasbeheer</h3><p>Beheer meerdere klassen, maak leerlingaccounts aan en verplaats leerlingen. Elke klas heeft een eigen ranking en eigen battlegroep.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div>
      <section class="teacher-classes-overview"><div class="teacher-class-cards">${classCards || '<p class="online-help">Nog geen klassen aangemaakt.</p>'}</div><form id="teacher-create-class-form" class="online-form teacher-create-class-form"><label for="teacher-new-class-name">Nieuwe klas aanmaken</label><input id="teacher-new-class-name" minlength="2" maxlength="80" placeholder="bv. 4ChemieB" required><button type="submit" class="online-primary">Maak klas aan</button></form></section>
      <div class="online-auth-layout"><article class="online-auth-card"><h3>Leerlingaccounts aanmaken</h3><p>Voer één leerling per regel in als <code>gebruikersnaam;wachtwoord</code>. Kies eerst de klas waarin je de nieuwe accounts wilt plaatsen.</p><form id="teacher-create-accounts-form" class="online-form"><label for="teacher-create-class">Klas voor nieuwe accounts<select id="teacher-create-class" required>${selectedClassOptions || '<option value="">Maak eerst een klas aan</option>'}</select></label><label for="teacher-student-lines">Leerlingen (gebruikersnaam;wachtwoord)</label><textarea id="teacher-student-lines" rows="8" placeholder="chemicus01;TijdelijkWachtwoord1
chemicus02;TijdelijkWachtwoord2" required></textarea><button type="submit" class="online-primary" ${teacherClassCache.length ? '' : 'disabled'}>Maak leerlingaccounts</button></form><div id="teacher-account-results" class="teacher-results hidden" aria-live="polite"></div></article>
      <article class="online-auth-card"><h3>Leerlingwachtwoord resetten</h3><p>Gebruik dit wanneer een leerling uit één van jouw klassen het wachtwoord vergeten is. Het nieuwe wachtwoord wordt onmiddellijk actief.</p><form id="teacher-reset-form" class="online-form"><label for="teacher-reset-username">Gebruikersnaam</label><input id="teacher-reset-username" pattern="[a-zA-Z0-9_-]{3,20}" required><label for="teacher-reset-password">Nieuw wachtwoord (minstens 8 tekens)</label><input id="teacher-reset-password" type="password" minlength="8" autocomplete="new-password" required><button type="submit" class="online-secondary">Reset wachtwoord</button></form><p class="teacher-warn">Deel tijdelijke wachtwoorden alleen rechtstreeks met de leerling. Zet ze niet in een publiek klasdocument.</p></article></div>
      <section class="teacher-student-list"><div class="online-view-heading"><div><h3>👥 Leerlingen in jouw klassen</h3><p>${students.length} leerlingaccount${students.length === 1 ? '' : 's'} verdeeld over ${teacherClassCache.length} klas(sen).</p></div></div><div class="online-table-wrap"><table class="online-table"><thead><tr><th>Gebruikersnaam</th><th>Klas</th><th>XP</th><th>Level</th><th>Klas wijzigen</th><th>Accountbeheer</th></tr></thead><tbody>${studentRows || '<tr><td colspan="6">Er zijn nog geen leerlingaccounts in jouw klassen.</td></tr>'}</tbody></table></div><p class="teacher-warn">Een leerling verplaatsen beëindigt eventuele openstaande battles. Afgeronde battles blijven in de historie van de deelnemers staan.</p><p class="teacher-warn">Let op: verwijderen is definitief. Ook XP, LabCoins, kaarten, skins, sprintresultaten en spelgeschiedenis van die leerling worden verwijderd.</p></section>
      <section class="teacher-question-manager"><div class="online-view-heading"><div><h3>🧪 Vragenbeheer per leerjaar</h3><p>Elk leerjaar heeft een eigen vragenbank. Wijzigingen gelden voor leerlingen zodra ze de game opnieuw laden.</p></div></div>
        <div class="teacher-question-toolbar"><label for="teacher-question-level">Vragenset kiezen<select id="teacher-question-level">${LEVELS_FOR_QUESTIONS.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label></div>
        <div id="teacher-puzzle-settings" class="teacher-puzzle-settings"></div>
        <div id="teacher-question-status" class="teacher-question-status" role="status">Vragen worden geladen…</div><div id="teacher-question-list" class="teacher-question-grid"></div>
        <form id="teacher-question-form" class="teacher-question-form"><input id="teacher-question-id" type="hidden"><label for="teacher-question-object">Puzzelplek<select id="teacher-question-object"><option value="object1">Puzzelplek 1</option><option value="object2">Puzzelplek 2</option><option value="object3">Puzzelplek 3</option><option value="object4">Puzzelplek 4</option></select></label>
        <label for="teacher-question-difficulty">Moeilijkheid<select id="teacher-question-difficulty"><option value="basis">Basis</option><option value="gemiddeld">Gemiddeld</option><option value="moeilijk">Moeilijk</option></select></label>
        <label for="teacher-question-type">Vraagtype<select id="teacher-question-type"><option value="multiple_choice">Meerkeuzevraag</option><option value="numeric">Rekenvraag (geheel getal)</option><option value="short_answer">Kort antwoord (open tekstveld)</option></select></label>
        <label for="teacher-question-text" class="span-all">Vraag<textarea id="teacher-question-text" rows="3" maxlength="1000" required placeholder="Typ hier de vraag…"></textarea></label>
        <label for="teacher-question-options" id="teacher-question-options-wrap" class="span-all">Vier antwoordopties (één per regel)<textarea id="teacher-question-options" rows="4" placeholder="Optie A
Optie B
Optie C
Optie D"></textarea></label>
        <label for="teacher-question-answer" id="teacher-question-answer-label">Correct antwoord<select id="teacher-question-answer"><option value="1">Optie 1</option><option value="2">Optie 2</option><option value="3">Optie 3</option><option value="4">Optie 4</option></select></label>
        <div class="span-all" style="display:flex;gap:9px;flex-wrap:wrap"><button type="submit" class="online-primary" id="teacher-question-save">Vraag opslaan</button><button type="button" class="online-secondary" id="teacher-question-new">Nieuwe vraag / formulier leegmaken</button></div>
        <p class="teacher-question-status span-all">Label elke vraag als Basis, Gemiddeld of Moeilijk. Het aantal vragen (3, 5 of 10) stel je bovenaan per puzzelplek in. Zorg dat de gekozen moeilijkheid voldoende actieve vragen bevat.</p>
        </form></section>
      <section class="teacher-question-manager teacher-card-manager"><div class="online-view-heading"><div><h3>🃏 Kaarten en reacties beheren</h3><p>Beheer de winkelkaarten, kracht, type, speciale ondersteuning en chemische reacties. De kaartcatalogus en reacties worden gedeeld binnen dit Supabase-project.</p></div></div>
        <div class="teacher-card-layout">
          <article class="online-auth-card"><h4>Kaartcatalogus</h4><div id="teacher-card-list" class="teacher-card-list">Kaarten worden geladen…</div></article>
          <form id="teacher-card-form" class="teacher-question-form"><h4 class="span-all">Kaart toevoegen / aanpassen</h4><label>Kaart-ID<input id="teacher-card-id" pattern="[a-z0-9][a-z0-9-]{1,49}" placeholder="bv. water" required></label><label>Naam<input id="teacher-card-name" required></label><label>Formule<input id="teacher-card-formula" placeholder="H₂O" required></label><label>Kaarttype<input id="teacher-card-type" list="teacher-card-types" value="gas" required><datalist id="teacher-card-types"><option value="water"><option value="vuur"><option value="steen"><option value="metaal"><option value="gas"><option value="vloeistof"><option value="zout"><option value="edelgas"><option value="vaste stof"></datalist></label><label>Winkelprijs (LabCoins)<input id="teacher-card-price" type="number" min="0" max="10000" value="5" required></label><label>Kracht (1–20)<input id="teacher-card-power" type="number" min="1" max="20" value="1" required></label><label class="span-all">Beschrijving<textarea id="teacher-card-description" rows="2"></textarea></label><label>Ondersteuning tegen type<input id="teacher-card-target" list="teacher-card-types" placeholder="leeg = geen ondersteuning"></label><label>Ondersteuningseffect<select id="teacher-card-effect"><option value="none">Geen</option><option value="halve">Halveert kracht van doeltype</option><option value="cancel_damage">Voorkomt alle schade in dit duel</option></select></label><label class="span-all">Tekst ondersteuning<textarea id="teacher-card-support-description" rows="2" placeholder="bv. Halveert de kracht van een vuurkaart."></textarea></label><label><span><input id="teacher-card-shop" type="checkbox"> Te koop in de winkel</span></label><label><span><input id="teacher-card-reward" type="checkbox"> Exclusieve battlebeloning</span></label><div class="span-all" style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" class="online-primary">Kaart opslaan</button><button type="button" class="online-secondary" id="teacher-card-new">Nieuw formulier</button></div></form>
        </div>
        <div class="teacher-card-layout teacher-reaction-layout"><article class="online-auth-card"><h4>Reacties</h4><div id="teacher-reaction-list" class="teacher-card-list">Reacties worden geladen…</div></article>
          <form id="teacher-reaction-form" class="teacher-question-form"><h4 class="span-all">Reactie toevoegen / aanpassen</h4><input type="hidden" id="teacher-reaction-id"><label class="span-all">Naam van de reactie<input id="teacher-reaction-name" required placeholder="Vorming van water"></label><label>Beginstof 1<select id="teacher-reaction-a"></select></label><label>Aantal beginstof 1<input id="teacher-reaction-a-qty" type="number" min="1" max="99" value="2" required></label><label>Beginstof 2<select id="teacher-reaction-b"></select></label><label>Aantal beginstof 2<input id="teacher-reaction-b-qty" type="number" min="1" max="99" value="1" required></label><label>Product 1<select id="teacher-reaction-pa"></select></label><label>Aantal product 1<input id="teacher-reaction-pa-qty" type="number" min="1" max="99" value="2" required></label><label>Product 2 (optioneel)<select id="teacher-reaction-pb"></select></label><label>Aantal product 2<input id="teacher-reaction-pb-qty" type="number" min="0" max="99" value="0"></label><label class="span-all">Weergave reactievergelijking<input id="teacher-reaction-equation" placeholder="2 H₂ + O₂ → 2 H₂O"></label><label><span><input id="teacher-reaction-active" type="checkbox" checked> Actief voor leerlingen</span></label><div class="span-all" style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" class="online-primary">Reactie opslaan</button><button type="button" class="online-secondary" id="teacher-reaction-new">Nieuwe reactie</button></div></form>
        </div>
        <form id="teacher-battle-settings-form" class="teacher-question-form"><h4 class="span-all">⚔️ Battle-instellingen</h4><label>Startlevenskracht per speler<input id="teacher-battle-hp" type="number" min="1" max="200" value="20" required></label><div><button type="submit" class="online-primary">Battle-instelling opslaan</button></div><p class="teacher-question-status span-all">Elke speler kiest vijf kaarten. Hogere kracht veroorzaakt schade gelijk aan het verschil; gelijke kracht veroorzaakt geen schade. Een halvering wordt naar beneden afgerond op een geheel getal. Speciale ondersteuning werkt onafhankelijk van de aanvals- of verdedigingsrol. Na elk duel wisselen de rollen. De ingestelde startlevenskracht geldt voor nieuwe battles binnen dit project.</p></form>
      </section>`;
    try { await renderTeacherQuestions('medieval'); } catch (questionError) { console.error(questionError); const status=document.getElementById('teacher-question-status'); if(status) status.textContent='Vragenbeheer is nog niet geactiveerd. Voer de SQL-migratie uit die in het updatepakket staat.'; const list=document.getElementById('teacher-question-list'); if(list) list.innerHTML='<p class="online-help">Voer eerst de meegeleverde Supabase-migratie uit om vragensets online te beheren.</p>'; }
    try { await renderTeacherCardManager(); } catch (cardError) { console.error(cardError); const list=document.getElementById('teacher-card-list'); if(list) list.textContent='Kaartbeheer kon niet laden. Controleer of de kaartenmigratie in Supabase is uitgevoerd.'; }
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
    if (!answer) return;
    if (type === 'numeric') answer.innerHTML = '<span>Correct antwoord (geheel getal)</span><input id="teacher-question-answer" type="number" step="1" required placeholder="bv. 42">';
    else if (type === 'short_answer') answer.innerHTML = '<span>Correct kort antwoord</span><input id="teacher-question-answer" type="text" maxlength="200" required placeholder="Typ het verwachte antwoord…"><small>Hoofdletters en extra spaties worden bij het nakijken genegeerd.</small>';
    else answer.innerHTML = '<span>Correct antwoord</span><select id="teacher-question-answer"><option value="1">Optie 1</option><option value="2">Optie 2</option><option value="3">Optie 3</option><option value="4">Optie 4</option></select>';
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
      const typeLabel = q.question_type === 'numeric' ? 'Rekenvraag' : q.question_type === 'short_answer' ? 'Kort antwoord' : 'Meerkeuze';
      const answer = q.question_type === 'numeric' ? String(q.correct_answer) : q.question_type === 'short_answer' ? (q.correct_answer_text || '—') : (q.options?.[Number(q.correct_answer)] ?? '—');
      return `<article class="teacher-question-item"><small>${esc(labels[q.object_id] || q.object_id)} · ${typeLabel} · <b class="difficulty-tag difficulty-tag-${esc(q.difficulty)}">${esc(difficultyLabels[q.difficulty] || q.difficulty)}</b></small><p>${esc(q.question_text)}</p><small>Correct antwoord: <strong>${esc(answer)}</strong></small><div class="teacher-question-actions"><button type="button" data-q-edit="${esc(q.question_id)}">Bewerken</button><button type="button" class="danger" data-q-delete="${esc(q.question_id)}">Archiveren</button></div></article>`;
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
    if (answer) answer.value = q.question_type === 'numeric' ? q.correct_answer : q.question_type === 'short_answer' ? (q.correct_answer_text || '') : Number(q.correct_answer)+1;
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
    let options = [], answer = 0, correctAnswerText = null;
    if (!question) throw new Error('Vul de vraagtekst in.');
    if (type === 'multiple_choice') {
      options = document.getElementById('teacher-question-options').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if (options.length !== 4) throw new Error('Een meerkeuzevraag moet precies vier niet-lege antwoordopties hebben.');
      const index = Number(document.getElementById('teacher-question-answer').value);
      if (!Number.isInteger(index) || index < 1 || index > 4) throw new Error('Kies het juiste antwoord uit optie 1 tot en met 4.');
      answer = index - 1;
    } else if (type === 'numeric') {
      answer = Number(document.getElementById('teacher-question-answer').value);
      if (!Number.isSafeInteger(answer)) throw new Error('Vul bij een rekenvraag een geheel getal in.');
    } else if (type === 'short_answer') {
      correctAnswerText = document.getElementById('teacher-question-answer').value.trim();
      if (!correctAnswerText) throw new Error('Vul het correcte korte antwoord in.');
      if (correctAnswerText.length > 200) throw new Error('Het correcte korte antwoord mag maximaal 200 tekens bevatten.');
      options = [];
    } else {
      throw new Error('Onbekend vraagtype.');
    }
    let id = document.getElementById('teacher-question-id').value.trim();
    if (!id) id = `t_${level}_${(window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2,9)}`).replace(/-/g,'').slice(0,30)}`;
    await rpc('teacher_save_quiz_question', { p_question_id:id, p_level_id:level, p_object_id:object, p_question_text:question, p_options:options, p_correct_answer:answer, p_question_type:type, p_difficulty:difficulty, p_correct_answer_text:correctAnswerText });
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
  function deckSelectMarkup(cards, ownedRows, prefix, selectedValues = []) {
    const quantity = new Map(ownedRows.map(row => [row.card_id, Number(row.quantity) || 0]));
    const options = cards.filter(c => (c.is_final_reward || String(c.formula).trim().toUpperCase() !== 'AU') && (quantity.get(c.id) || 0) > 0).map(c => `<option value="${esc(c.id)}">${esc(c.formula)} · ${esc(c.name)} (bezit: ${quantity.get(c.id)})</option>`).join('');
    const optionMarkup = options ? `<option value="">Kies een kaart…</option>${options}` : '<option value="">Geen kaarten in collectie</option>';
    return Array.from({length:5}, (_,i) => `<label class="deck-slot-label">Kaart ${i+1}<select name="deck_card_ids" class="deck-slot-select" data-deck-prefix="${esc(prefix)}" required>${optionMarkup}</select></label>`).join('');
  }
  function suggestDeck(cards, ownedRows) {
    const quantity = new Map(ownedRows.map(row => [row.card_id, Number(row.quantity) || 0]));
    const result = [];
    // Een kaartsoort kan maar één keer in een deck voorkomen, ook wanneer de leerling
    // meerdere exemplaren bezit. Au is toegestaan als het de exclusieve eindbeloning is.
    for (const card of cards) {
      if (result.length >= 5) break;
      if ((card.is_final_reward || String(card.formula).trim().toUpperCase() !== 'AU') && (quantity.get(card.id) || 0) > 0) {
        result.push(card.id);
      }
    }
    return result;
  }
  function syncDeckSelectOptions(form) {
    if (!form) return;
    const selects = [...form.querySelectorAll('.deck-slot-select')];
    const selectedIds = selects.map(select => select.value).filter(Boolean);
    selects.forEach(select => {
      const ownValue = select.value;
      [...select.options].forEach(option => {
        if (!option.value) return;
        option.disabled = option.value !== ownValue && selectedIds.includes(option.value);
      });
    });
  }
  function selectedDeck(form) {
    const values = [...(form?.querySelectorAll('[name="deck_card_ids"]') || [])].map(el=>el.value).filter(Boolean);
    if (values.length !== 5) throw new Error('Selecteer precies vijf kaarten.');
    if (new Set(values).size !== 5) throw new Error('Elke kaart mag maar één keer in je battledeck voorkomen. Kies vijf verschillende kaarten.');
    const available = new Map(ownedCardCache.map(row=>[row.card_id,Number(row.quantity)||0]));
    for (const id of values) if ((available.get(id) || 0) < 1) throw new Error('Je bezit niet alle geselecteerde kaarten.');
    return values;
  }
  async function renderBattles() {
    const [battles, { data: owned, error: oErr }, { data: catalog, error: cErr }] = await Promise.all([
      getMyBattles(), supabase.from('user_cards').select('card_id,quantity').eq('user_id', currentUser.id), supabase.from('card_catalog').select('id,name,formula,card_type,power,support_description,support_effect,is_reward_only,is_final_reward')
    ]);
    if (oErr) throw oErr; if (cErr) throw cErr;
    const cards = catalog || []; ownedCardCache = owned || [];
    const battleMarkup = await Promise.all(battles.map(async b => {
      const isChallenger = b.challenger_id === currentUser.id;
      const opponentName = isChallenger ? b.opponent_username : b.challenger_username;
      const isMyTurn = b.current_turn === currentUser.id;
      let sub = '';
      if (b.status === 'pending' && b.opponent_id === currentUser.id) {
        sub = `<p>${esc(b.challenger_username)} daagt je uit. Kies vijf kaarten voor jouw deck voordat je aanvaardt.</p><form class="battle-accept-form" data-battle-accept-form="${b.battle_id}"><div class="battle-deck-builder">${deckSelectMarkup(cards,ownedCardCache,`accept-${b.battle_id}`)}</div><div class="online-actions"><button type="button" data-battle-response="accept" data-id="${b.battle_id}">Aanvaarden met dit deck</button><button type="button" class="danger" data-battle-response="decline" data-id="${b.battle_id}">Weigeren</button></div></form>`;
      } else if (b.status === 'pending') sub = '<p>Uitdaging verstuurd. Je deck is vastgelegd; wachten op de keuze van je tegenstander.</p>';
      else if (b.status === 'declined') sub = '<p>Uitdaging geweigerd.</p>';
      else if (b.status === 'completed') { const rewardCard=cards.find(c=>c.id===b.reward_card_id); sub = `<p>${b.winner_id ? (b.winner_id === currentUser.id ? '🏆 Jij hebt gewonnen!' : 'De tegenstander heeft gewonnen.') : '🤝 Gelijkspel'}</p>${rewardCard && b.winner_id===currentUser.id ? `<p class="battle-reward">🎁 Je ontvangt ${esc(rewardCard.formula)} · ${esc(rewardCard.name)} — een exclusieve kaart die niet in de winkel te koop is.</p>` : ''}<div class="online-hp"><span>Jij: ${isChallenger ? b.challenger_hp : b.opponent_hp}/${b.starting_hp} HP</span><span>${esc(opponentName)}: ${isChallenger ? b.opponent_hp : b.challenger_hp}/${b.starting_hp} HP</span></div>`; }
      else if (b.status === 'active') {
        const [{ data: moves, error: mErr }, { data: ownDeck, error: dErr }] = await Promise.all([
          supabase.from('battle_moves').select('move_number,user_id,card_id,deck_slot,round_number,role,effective_power,damage,hp_after,support_note,damage_to_user_id,created_at').eq('battle_id', b.battle_id).order('move_number'),
          supabase.from('battle_decks').select('slot_number,card_id').eq('battle_id', b.battle_id).eq('user_id', currentUser.id).order('slot_number')
        ]);
        if (mErr) throw mErr; if (dErr) throw dErr;
        const usedSlots = new Set((moves || []).filter(m=>m.user_id===currentUser.id).map(m=>Number(m.deck_slot)));
        const rounds = new Map(); (moves || []).forEach(m=>{const arr=rounds.get(Number(m.round_number))||[];arr.push(m);rounds.set(Number(m.round_number),arr);});
        const moveList = [...rounds.entries()].sort((a,b)=>a[0]-b[0]).map(([round,arr])=>{
          const atk=arr.find(m=>m.role==='attacker'),def=arr.find(m=>m.role==='defender');
          const atkCard=cards.find(c=>c.id===atk?.card_id),defCard=cards.find(c=>c.id===def?.card_id);
          if (!def) return `<li><strong>Ronde ${round}</strong> · Aanval ingezet: ${esc(atkCard?.formula||'kaart')} — wachten op verdediging.</li>`;
          const damage=Number(def.damage)||0; const recipient=def.damage_to_user_id===currentUser.id?'jij':def.damage_to_user_id?'tegenstander':'niemand';
          const notes=def.support_note ? `<small class="battle-support-note">✨ ${esc(def.support_note)}</small>` : '';
          const outcome=damage===0?'Geen levenspunten verloren.':`${damage} HP schade aan ${recipient}.`;
          return `<li><strong>Ronde ${round}</strong> · Aanval: ${esc(atkCard?.formula||'')} (${Number(atk.effective_power)} kracht) · Verdediging: ${esc(defCard?.formula||'')} (${Number(def.effective_power)} kracht). <b>${esc(outcome)}</b>${notes}</li>`;
        }).join('');
        const hand = isMyTurn ? `<div class="online-hand"><strong>${b.current_role==='attacker'?'🗡️ Jij valt aan':'🛡️ Jij verdedigt'} — kies één kaart:</strong><div class="online-hand-grid">${(ownDeck||[]).filter(d=>!usedSlots.has(Number(d.slot_number))).map(d=>{const c=cards.find(x=>x.id===d.card_id);return `<button class="online-play-card" data-play-slot="${Number(d.slot_number)}" data-battle-id="${b.battle_id}"><b>${esc(c?.formula||d.card_id)}</b><span>${esc(c?.name||'Kaart')}</span><small>💪 Kracht ${Number(c?.power)||1} · ${esc(c?.card_type||'')}</small>${c?.support_description?`<em>${esc(c.support_description)}</em>`:''}<small>Deckslot ${Number(d.slot_number)}</small></button>`;}).join('') || '<p>Je hebt alle vijf kaarten al gespeeld.</p>'}</div></div>` : `<p class="battle-waiting">${b.current_role==='attacker'?'Tegenstander kiest een aanvalskaart.':'Tegenstander kiest een verdedigingskaart.'}</p>`;
        const role = isMyTurn ? (b.current_role==='attacker'?'Jij bent de aanvaller':'Jij bent de verdediger') : (b.current_role==='attacker'?'Tegenstander is de aanvaller':'Tegenstander is de verdediger');
        sub = `<div class="battle-turn-banner ${isMyTurn?'your-turn':'waiting-turn'}"><strong>${isMyTurn?'JOUW BEURT':'BEURT TEGENSTANDER'}</strong><span>${role}</span></div><div class="online-hp"><span>🧪 Jij: ${isChallenger ? b.challenger_hp : b.opponent_hp}/${b.starting_hp} HP</span><span>⚗ ${esc(opponentName)}: ${isChallenger ? b.opponent_hp : b.challenger_hp}/${b.starting_hp} HP</span></div><p class="battle-round-indicator">Duel ${Number(b.round_count)+1}/5 · ${b.current_role==='attacker'?'aanval':'verdediging'}</p><ol class="online-moves">${moveList || '<li>De battle is gestart. De uitdager valt aan.</li>'}</ol>${hand}`;
      }
      return `<article class="online-battle-card"><div class="online-view-heading"><div><h4>⚔️ Jij vs. ${esc(opponentName)}</h4><small>${esc(b.status)} · ${new Date(b.updated_at).toLocaleString('nl-BE')}</small></div><span class="online-pill">${b.status === 'active' ? `${isChallenger ? b.challenger_hp : b.opponent_hp} HP` : esc(b.status)}</span></div>${sub}</article>`;
    }));
    const deckOptions = deckSelectMarkup(cards,ownedCardCache,'challenge');
    view.innerHTML = `<div class="online-view-heading"><div><h3>⚔️ Chemiebattles</h3><p>Stel een battledeck van vijf verschillende kaarten samen en daag een klasgenoot uit. Elke kaartsoort mag maar één keer voorkomen, ook als je meerdere exemplaren bezit. De Au-eindkaart mag wel mee in je deck.</p></div><button class="online-small-btn" data-online-refresh>Vernieuwen</button></div><form id="battle-invite-form" class="online-invite-form"><label for="battle-opponent">Gebruikersnaam tegenstander</label><input id="battle-opponent" name="username" minlength="3" maxlength="20" pattern="[a-z0-9_-]{3,20}" placeholder="bv. chemicus_123" required><strong>Kies jouw vijf kaarten</strong><div class="battle-deck-builder">${deckOptions}</div><button>Verstuur uitdaging</button></form><div class="online-battles-list">${battleMarkup.join('') || '<p class="online-help">Nog geen uitdagingen of battles. Daag een klasgenoot uit!</p>'}</div>`;
    const suggestions = suggestDeck(cards,ownedCardCache);
    const inviteForm = document.querySelector('#battle-invite-form');
    inviteForm?.querySelectorAll('.deck-slot-select').forEach((select,i)=>{if(suggestions[i])select.value=suggestions[i];});
    syncDeckSelectOptions(inviteForm);
    document.querySelectorAll('.battle-accept-form').forEach(form=>{
      const picks=suggestDeck(cards,ownedCardCache);
      form.querySelectorAll('.deck-slot-select').forEach((select,i)=>{if(picks[i])select.value=picks[i];});
      syncDeckSelectOptions(form);
    });
  }

  async function renderTeacherCardManager() {
    if (currentProfile?.role !== 'teacher') return;
    const [{ data: cards, error: cErr }, { data: reactions, error: rErr }, { data: settings, error: sErr }] = await Promise.all([
      supabase.from('card_catalog').select('id,name,formula,card_type,price,power,description,support_target_type,support_effect,support_description,is_shop_item,is_reward_only,is_final_reward,rarity').order('name'),
      supabase.from('card_reactions').select('*').order('name'),
      supabase.from('battle_settings').select('starting_hp').eq('singleton',true).single()
    ]);
    if (cErr) throw cErr; if (rErr) throw rErr; if (sErr) throw sErr;
    teacherCardCache=cards||[]; teacherReactionCache=reactions||[];
    const options = teacherCardCache.filter(c=>!c.is_final_reward && String(c.formula).trim().toUpperCase() !== 'AU').map(c=>`<option value="${esc(c.id)}">${esc(c.formula)} · ${esc(c.name)}</option>`).join('');
    ['teacher-reaction-a','teacher-reaction-b','teacher-reaction-pa','teacher-reaction-pb'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=(id==='teacher-reaction-pb'?'<option value="">Geen tweede product</option>':'')+options;});
    const list=document.getElementById('teacher-card-list');
    if(list)list.innerHTML=teacherCardCache.map(c=>{const isAu=String(c.formula).trim().toUpperCase()==='AU';const isFinalAu=Boolean(c.is_final_reward)&&isAu;const fixed=c.is_final_reward||isAu;const cardLabel=c.is_final_reward?'exclusieve eindbeloning':isAu?'oude Au-kaart · niet beschikbaar':c.is_shop_item?'winkel':c.is_reward_only?'battlebeloning':'alleen reactieproduct';const editor=isFinalAu?`<div class="teacher-au-strength-editor"><label for="teacher-au-power-${esc(c.id)}">Kracht (1–20)<input id="teacher-au-power-${esc(c.id)}" type="number" min="1" max="20" step="1" value="${Number(c.power)||1}" data-au-final-power></label><button type="button" data-au-final-power-save="${esc(c.id)}">Kracht opslaan</button></div>`:fixed?'<span class="card-reward-tag final-reward-tag">Vast · niet aanpassen</span>':`<button type="button" data-teacher-card-edit="${esc(c.id)}">Bewerken</button>`;return `<article class="teacher-card-row"><div><strong>${esc(c.formula)} · ${esc(c.name)}</strong><small>${esc(c.card_type)} · kracht ${Number(c.power)} · ${Number(c.price)} coins · ${cardLabel}</small>${c.support_description?`<small>✨ ${esc(c.support_description)}</small>`:''}</div>${editor}</article>`;}).join('');
    const rlist=document.getElementById('teacher-reaction-list');
    if(rlist)rlist.innerHTML=teacherReactionCache.map(r=>{const byId=new Map(teacherCardCache.map(c=>[c.id,c]));const text= r.equation_text || `${r.reactant_a_qty} ${byId.get(r.reactant_a_id)?.formula||r.reactant_a_id} + ${r.reactant_b_qty} ${byId.get(r.reactant_b_id)?.formula||r.reactant_b_id}`;return `<article class="teacher-card-row"><div><strong>${esc(r.name)}</strong><small>${esc(text)}</small><small>${r.active?'Actief':'Gearchiveerd'}</small></div><div><button type="button" data-teacher-reaction-edit="${r.id}">Bewerken</button>${r.active?`<button type="button" class="danger" data-teacher-reaction-archive="${r.id}">Archiveren</button>`:''}</div></article>`;}).join('')||'<p>Er zijn nog geen reacties.</p>';
    const hp=document.getElementById('teacher-battle-hp');if(hp)hp.value=Number(settings.starting_hp)||20;
    resetTeacherCardForm();resetTeacherReactionForm();
  }
  function resetTeacherCardForm(){
    const form=document.getElementById('teacher-card-form');if(!form)return;form.reset();
    const id=document.getElementById('teacher-card-id');if(id)id.readOnly=false;
    const price=document.getElementById('teacher-card-price');if(price)price.value='5';
    const power=document.getElementById('teacher-card-power');if(power)power.value='1';
  }
  function editTeacherCard(id){
    const c=teacherCardCache.find(x=>x.id===id);if(!c)return;
    const values={id:c.id,name:c.name,formula:c.formula,card_type:c.card_type,price:c.price,power:c.power,description:c.description,support_target_type:c.support_target_type||'',support_effect:c.support_effect||'none',support_description:c.support_description||''};
    Object.entries(values).forEach(([key,value])=>{const el=document.getElementById('teacher-card-'+(key==='card_type'?'type':key==='support_target_type'?'target':key==='support_effect'?'effect':key==='support_description'?'support-description':key));if(el)el.value=value??'';});
    document.getElementById('teacher-card-shop').checked=Boolean(c.is_shop_item);document.getElementById('teacher-card-reward').checked=Boolean(c.is_reward_only);
    const idEl=document.getElementById('teacher-card-id');if(idEl)idEl.readOnly=true;
    document.getElementById('teacher-card-form').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function resetTeacherReactionForm(){
    const form=document.getElementById('teacher-reaction-form');if(!form)return;form.reset();
    const id=document.getElementById('teacher-reaction-id');if(id)id.value='';
    const ids=['teacher-reaction-a','teacher-reaction-b','teacher-reaction-pa','teacher-reaction-pb'];ids.forEach(elid=>{const el=document.getElementById(elid);if(el&&el.options.length)el.selectedIndex=elid==='teacher-reaction-pb'?0:0;});
    const active=document.getElementById('teacher-reaction-active');if(active)active.checked=true;
  }
  function editTeacherReaction(id){
    const r=teacherReactionCache.find(x=>x.id===id);if(!r)return;
    const values={id:r.id,name:r.name,a:r.reactant_a_id,b:r.reactant_b_id,'a-qty':r.reactant_a_qty,'b-qty':r.reactant_b_qty,pa:r.product_a_id,'pa-qty':r.product_a_qty,pb:r.product_b_id||'','pb-qty':r.product_b_qty,equation:r.equation_text||''};
    Object.entries(values).forEach(([key,value])=>{const el=document.getElementById('teacher-reaction-'+key);if(el)el.value=value??'';});
    document.getElementById('teacher-reaction-active').checked=Boolean(r.active);
    document.getElementById('teacher-reaction-form').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function saveTeacherCard(e){
    e.preventDefault();requireLogin();if(currentProfile?.role!=='teacher')throw new Error('Alleen de leerkracht kan kaarten beheren.');
    const card={id:document.getElementById('teacher-card-id').value.trim(),name:document.getElementById('teacher-card-name').value.trim(),formula:document.getElementById('teacher-card-formula').value.trim(),card_type:document.getElementById('teacher-card-type').value,price:Number(document.getElementById('teacher-card-price').value),power:Number(document.getElementById('teacher-card-power').value),description:document.getElementById('teacher-card-description').value.trim(),support_target_type:document.getElementById('teacher-card-target').value,support_effect:document.getElementById('teacher-card-effect').value,support_description:document.getElementById('teacher-card-support-description').value.trim(),is_shop_item:document.getElementById('teacher-card-shop').checked,is_reward_only:document.getElementById('teacher-card-reward').checked};
    await rpc('teacher_save_card',{p_card:card});await renderTeacherCardManager();msg('Kaartinstellingen opgeslagen.','good');
  }
  async function saveTeacherReaction(e){
    e.preventDefault();requireLogin();if(currentProfile?.role!=='teacher')throw new Error('Alleen de leerkracht kan reacties beheren.');
    const reaction={id:document.getElementById('teacher-reaction-id').value.trim(),name:document.getElementById('teacher-reaction-name').value.trim(),reactant_a_id:document.getElementById('teacher-reaction-a').value,reactant_a_qty:Number(document.getElementById('teacher-reaction-a-qty').value),reactant_b_id:document.getElementById('teacher-reaction-b').value,reactant_b_qty:Number(document.getElementById('teacher-reaction-b-qty').value),product_a_id:document.getElementById('teacher-reaction-pa').value,product_a_qty:Number(document.getElementById('teacher-reaction-pa-qty').value),product_b_id:document.getElementById('teacher-reaction-pb').value||null,product_b_qty:Number(document.getElementById('teacher-reaction-pb-qty').value)||0,equation_text:document.getElementById('teacher-reaction-equation').value.trim(),active:document.getElementById('teacher-reaction-active').checked};
    await rpc('teacher_save_reaction',{p_reaction:reaction});await renderTeacherCardManager();msg('Chemische reactie opgeslagen.','good');
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
    const classId = document.getElementById('teacher-create-class')?.value || '';
    if (!classId) throw new Error('Kies eerst de klas waarin je de leerlingaccounts wilt aanmaken.');
    const response = await fetch('/.netlify/functions/teacher-create-students', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ students, classId }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Leerlingaccounts aanmaken is mislukt.');
    const created = new Set((result.created || []).map(x => x.username));
    const report = students.filter(x => created.has(x.username)).map(x => `${x.username}  |  ${x.password}`).join('\n');
    const failed = (result.errors || []).map(x => `${x.username}: ${x.error}`).join('\n');
    const box = document.getElementById('teacher-account-results');
    if (box) { box.classList.remove('hidden'); box.textContent = `${result.created?.length || 0} account(s) aangemaakt. Bewaar deze inloggegevens en deel ze veilig uit:\n\n${report || '(geen nieuwe accounts)'}${failed ? `\n\nNiet gelukt:\n${failed}` : ''}`; }
    document.getElementById('teacher-student-lines').value = '';
    msg(`${result.created?.length || 0} leerlingaccount(s) aangemaakt in ${result.className || 'de gekozen klas'}.`, 'good');
    await renderTeacher();
  }
  async function handleTeacherCreateClass(e) {
    e.preventDefault();
    const name = (document.getElementById('teacher-new-class-name')?.value || '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('Een klasnaam moet 2 tot 80 tekens bevatten.');
    const result = await teacherFunction('teacher-manage-classes', { body: { action: 'create-class', name } });
    teacherCreateClassId = result.class?.id || teacherCreateClassId;
    teacherLeaderboardClassId = result.class?.id || teacherLeaderboardClassId;
    msg(`Klas '${result.class?.name || name}' is aangemaakt.`, 'good');
    await renderTeacher();
  }
  async function handleTeacherMoveStudent(button) {
    const username = button.dataset.teacherMoveStudent;
    const row = button.closest('tr');
    const classId = row?.querySelector('[data-student-class-select]')?.value;
    if (!username || !classId) throw new Error('Kies een geldige leerling en klas.');
    const selected = teacherClassCache.find(c => c.id === classId);
    if (!window.confirm(`Leerling '${username}' verplaatsen naar '${selected?.name || 'de gekozen klas'}'? Eventuele openstaande battles worden beëindigd.`)) return;
    await teacherFunction('teacher-manage-classes', { body: { action: 'move-student', username, classId } });
    msg(`Leerling '${username}' is verplaatst naar ${selected?.name || 'de gekozen klas'}.`, 'good');
    await renderTeacher();
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
    try { const completion = await rpc('get_my_game_completion'); window.ChemieGameBridge?.applyOnlineGameCompletion?.(completion); } catch (completionError) { console.warn('Voltooide hoofdmissie kon niet worden geladen.', completionError); }
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
    const cardEdit = e.target.closest('[data-teacher-card-edit]'); if (cardEdit) { editTeacherCard(cardEdit.dataset.teacherCardEdit); return; }
    const auPowerSave = e.target.closest('[data-au-final-power-save]'); if (auPowerSave) { await action(async()=>{ const row=auPowerSave.closest('.teacher-card-row'); const input=row?.querySelector('[data-au-final-power]'); const power=Number(input?.value); if(!Number.isInteger(power)||power<1||power>20) throw new Error('De kracht van Au moet een geheel getal tussen 1 en 20 zijn.'); await rpc('teacher_set_final_reward_power',{p_power:power}); msg(`De kracht van de exclusieve Au-kaart is ingesteld op ${power}.`,'good'); }); return; }
    const reactionEdit = e.target.closest('[data-teacher-reaction-edit]'); if (reactionEdit) { editTeacherReaction(reactionEdit.dataset.teacherReactionEdit); return; }
    const reactionArchive = e.target.closest('[data-teacher-reaction-archive]'); if (reactionArchive) { await action(async()=>{ await rpc('teacher_archive_reaction',{p_reaction_id:reactionArchive.dataset.teacherReactionArchive}); await renderTeacherCardManager(); }); return; }
    const cardTab = e.target.closest('[data-card-tab]'); if (cardTab) { cardShopTab=cardTab.dataset.cardTab; await renderCardsPanel(await getEconomy()); return; }
    const reactionRun = e.target.closest('#reaction-run'); if (reactionRun && reactionRun.dataset.reactionId) { await action(async()=>{ await rpc('perform_card_reaction',{p_reaction_id:reactionRun.dataset.reactionId}); cardShopTab='collection'; }); return; }
    const moveStudent = e.target.closest('[data-teacher-move-student]');
    if (moveStudent) { await action(() => handleTeacherMoveStudent(moveStudent)); return; }
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
    const response = e.target.closest('[data-battle-response]'); if (response) { await action(async () => { const accept=response.dataset.battleResponse==='accept'; const form=response.closest('.battle-accept-form'); const deck=accept?selectedDeck(form):null; await rpc('respond_to_battle', { p_battle_id: response.dataset.id, p_accept: accept, p_deck_card_ids: deck }); }); return; }
    const play = e.target.closest('[data-play-slot]'); if (play) { await action(async () => { await rpc('play_battle_card', { p_battle_id: play.dataset.battleId, p_deck_slot: Number(play.dataset.playSlot) }); }); return; }
  }
  function bindEvents() {
    root?.addEventListener('click', e => { handleClick(e).catch(err => { console.error(err); msg(err.message || 'Er ging iets mis.', 'bad'); }); });
    document.getElementById('online-login')?.addEventListener('click', () => action(handleLogin));
    document.getElementById('online-auth-form')?.addEventListener('submit', e => { e.preventDefault(); action(handleLogin); });
    document.getElementById('online-teacher-setup-form')?.addEventListener('submit', e => action(() => handleTeacherSetup(e)));
    view?.addEventListener('submit', e => {
      if (e.target.id === 'teacher-create-accounts-form') { action(() => handleCreateStudentAccounts(e)); return; }
      if (e.target.id === 'teacher-create-class-form') { action(() => handleTeacherCreateClass(e)); return; }
      if (e.target.id === 'teacher-reset-form') { action(() => handleTeacherPasswordReset(e)); return; }
      if (e.target.id === 'teacher-question-form') { e.preventDefault(); handleTeacherQuestionSave(e).catch(err => { console.error(err); msg(err.message || 'Vraag opslaan is mislukt.', 'bad'); }); return; }
      if (e.target.id === 'teacher-card-form') { action(()=>saveTeacherCard(e)); return; }
      if (e.target.id === 'teacher-reaction-form') { action(()=>saveTeacherReaction(e)); return; }
      if (e.target.id === 'teacher-battle-settings-form') { e.preventDefault(); action(async()=>{const hp=Number(document.getElementById('teacher-battle-hp').value); await rpc('teacher_set_battle_settings',{p_starting_hp:hp}); msg('Startlevenskracht bijgewerkt.','good');}); return; }
    });
    view?.addEventListener('change', e => {
      if (e.target.matches('.deck-slot-select')) syncDeckSelectOptions(e.target.closest('form'));
      if (e.target.id === 'teacher-create-class') teacherCreateClassId = e.target.value;
      if (e.target.id === 'teacher-ranking-class') { teacherLeaderboardClassId = e.target.value; renderLeaderboard().catch(err => { console.error(err); msg(err.message || 'Ranking laden is mislukt.', 'bad'); }); }
      if (e.target.id === 'teacher-question-level') renderTeacherQuestions(e.target.value).catch(err => { console.error(err); msg(err.message || 'Vragenset laden is mislukt.', 'bad'); });
      if (e.target.id === 'teacher-question-type') toggleQuestionEditorType();
      if (e.target.matches('[data-reaction-selector]')) renderReactionPreview();
      if (e.target.matches('[data-puzzle-count]')) action(async () => {
        const objectId = e.target.dataset.puzzleCount, required = Number(e.target.value);
        await rpc('teacher_set_puzzle_questions', { p_level_id: teacherQuestionLevel, p_object_id: objectId, p_questions_required: required });
        msg(`${required} vragen ingesteld voor ${objectId}.`, 'good');
        await renderTeacherQuestions(teacherQuestionLevel);
      });
    });
    document.getElementById('online-logout')?.addEventListener('click', () => action(signOut));
    view?.addEventListener('click', e=>{ if(e.target.closest('#teacher-card-new'))resetTeacherCardForm(); if(e.target.closest('#teacher-reaction-new'))resetTeacherReactionForm(); });
    view?.addEventListener('submit', e => {
      if (e.target.id !== 'battle-invite-form') return;
      e.preventDefault(); const username = (document.getElementById('battle-opponent')?.value || '').trim().toLowerCase();
      action(async () => { const deck=selectedDeck(e.target); await rpc('create_battle', { p_opponent_username: username, p_deck_card_ids: deck }); });
    });
  }

  // Compatibility API used by the existing escape-room game.
  window.ChemieOnline = {
    isAuthenticated: () => Boolean(currentUser),
    async startPuzzleAttempt(levelId, objectId, difficulty) { requireLogin(); return rpc('start_puzzle_attempt', { p_level_id: levelId, p_object_id: objectId, p_difficulty: difficulty }); },
    async getActivePuzzleAttempt(levelId, objectId) { requireLogin(); return rpc('get_my_active_puzzle_attempt', { p_level_id: levelId, p_object_id: objectId }); },
    async unlockLevel(levelId, code) { requireLogin(); return rpc('unlock_level_with_code', { p_target_level: levelId, p_code: code }); },
    async completeEscapeRoomWithCode(code) { requireLogin(); return rpc('complete_escape_room_with_code', { p_code: code }); },
    async getGameCompletion() { requireLogin(); return rpc('get_my_game_completion'); },
    async submitPuzzleAnswer(attemptId, questionId, answer, questionType = 'multiple_choice') {
      requireLogin();
      const result = questionType === 'short_answer'
        ? await rpc('submit_puzzle_attempt_short_answer', { p_attempt_id: attemptId, p_question_id: questionId, p_answer: String(answer ?? '') })
        : await rpc('submit_puzzle_attempt_answer', { p_attempt_id: attemptId, p_question_id: questionId, p_answer: Number(answer) });
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
    async startOgSprint() { requireLogin(); return rpc('start_oxidation_sprint'); },
    async submitOgSprintAnswer(sessionId, sequenceNumber, answer) { requireLogin(); return rpc('submit_oxidation_sprint_answer', { p_session_id: sessionId, p_sequence_number: sequenceNumber, p_answer: answer }); },
    async finishOgSprint(sessionId) { requireLogin(); return rpc('finish_oxidation_sprint', { p_session_id: sessionId }); },
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
