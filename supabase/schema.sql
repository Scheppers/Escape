-- Chemie Escape Room — Supabase online backend (MVP)
-- Run this file ONCE in Supabase SQL Editor. It creates RLS-protected tables and server-side RPCs.
-- Never paste a service_role/secret key into the website.
create extension if not exists pgcrypto;

-- Klassen houden leerlingen, ranking en battles gescheiden.
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);

-- Public catalogues contain only game content, never player balances.
create table if not exists public.card_catalog (
  id text primary key, name text not null, formula text not null, category text not null,
  rarity text not null default 'Gewoon', price integer not null check(price >= 0),
  attack integer not null check(attack between 1 and 10), shield integer not null check(shield between 1 and 10),
  description text not null default ''
);
create table if not exists public.skin_catalog (
  id text primary key, name text not null, emoji text not null, price integer not null check(price >= 0),
  description text not null default ''
);
insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description) values
 ('hydrogen','Waterstof','H','Element','Start',0,3,2,'Licht en snel.'),
 ('helium','Helium','He','Edelgas','Start',0,2,5,'Rustig en beschermend.'),
 ('carbon','Koolstof','C','Element','Start',0,4,3,'Veelzijdige basisstof.'),
 ('oxygen','Zuurstof','O','Element','Start',0,4,2,'Actief en wendbaar.'),
 ('iron','IJzer','Fe','Metaal','Start',0,5,4,'Stevig evenwicht tussen aanval en schild.'),
 ('sodium','Natrium','Na','Alkalimetaal','Gewoon',10,6,1,'Hoge aanval, weinig bescherming.'),
 ('chlorine','Chloor','Cl','Halogeen','Gewoon',12,6,2,'Een krachtige aanvalskaart.'),
 ('sulfur','Zwavel','S','Niet-metaal','Gewoon',16,7,2,'Krachtige maar kwetsbare kaart.'),
 ('water','Water','H₂O','Verbinding','Gewoon',15,4,6,'Een sterke verdedigingskaart.'),
 ('carbon-dioxide','Koolstofdioxide','CO₂','Verbinding','Gewoon',16,5,4,'Gebalanceerde verbinding.'),
 ('ammonia','Ammoniak','NH₃','Verbinding','Zeldzaam',18,6,3,'Een veelzijdige verbinding.'),
 ('silver','Zilver','Ag','Edelmetaal','Zeldzaam',18,5,5,'Sterk schild en solide aanval.'),
 ('calcium-carbonate','Calciumcarbonaat','CaCO₃','Verbinding','Zeldzaam',20,4,8,'Zeer sterke verdediging.'),
 ('sodium-chloride','Natriumchloride','NaCl','Zout','Zeldzaam',22,7,3,'Harde, krachtige kaart.'),
 ('gold','Goud','Au','Edelmetaal','Episch',25,8,1,'Zeer hoge aanval, zwak schild.'),
 ('ozone','Ozon','O₃','Verbinding','Episch',24,7,4,'Krachtige aanval met goede balans.'),
 ('ethanol','Ethanol','C₂H₆O','Verbinding','Zeldzaam',20,5,6,'Flexibele verdedigende kaart.'),
 ('copper','Koper','Cu','Metaal','Gewoon',12,5,3,'Degelijke middenmoter.')
on conflict(id) do update set name=excluded.name, formula=excluded.formula, category=excluded.category, rarity=excluded.rarity, price=excluded.price, attack=excluded.attack, shield=excluded.shield, description=excluded.description;

insert into public.skin_catalog(id,name,emoji,price,description) values
 ('starter','Beginnende alchemist','🧪',0,'Je vertrouwde startuitrusting.'),
 ('brass','Messing Meester','🥽',8,'Een veiligheidsbril voor de echte laboprofessional.'),
 ('crystal','Kristalchemicus','🔮',15,'Een mysterieuze, fonkelende alchemistenskin.'),
 ('neon','Neononderzoeker','🧑‍🔬',25,'Een futuristische onderzoeker met flair.'),
 ('cosmic','Kosmische Alchemist','🧑‍🚀',40,'Voor chemici die tussen de sterren thuishoren.'),
 ('master','Meester der Elementen','👑',60,'De prestigieuze kroon voor verzamelaars.')
on conflict(id) do update set name=excluded.name, emoji=excluded.emoji, price=excluded.price, description=excluded.description;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check(username ~ '^[a-z0-9_-]{3,20}$'),
  class_id uuid references public.classes(id) on delete restrict,
  role text not null default 'student' check(role in ('student','teacher')),
  xp integer not null default 0 check(xp >= 0),
  coins integer not null default 10 check(coins >= 0),
  equipped_skin text not null default 'starter' references public.skin_catalog(id),
  created_at timestamptz not null default now()
);
-- Safe additions when upgrading a database that already has the older MVP schema.
alter table public.profiles add column if not exists class_id uuid references public.classes(id) on delete restrict;
alter table public.profiles add column if not exists role text not null default 'student' check(role in ('student','teacher'));
create index if not exists profiles_class_rank_idx on public.profiles(class_id, role, xp desc, created_at asc);

create table if not exists public.user_skins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skin_id text not null references public.skin_catalog(id),
  purchased_at timestamptz not null default now(),
  primary key(user_id, skin_id)
);
create table if not exists public.user_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.card_catalog(id),
  purchased_at timestamptz not null default now(),
  primary key(user_id, card_id)
);
create table if not exists public.quiz_questions (
  question_id text primary key, level_id text not null, object_id text not null,
  question_text text not null, options jsonb not null default '[]'::jsonb,
  correct_answer integer not null, question_type text not null
);
create table if not exists public.question_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id text not null references public.quiz_questions(question_id) on delete cascade,
  xp_awarded integer not null default 5, awarded_at timestamptz not null default now(),
  primary key(user_id, question_id)
);
create table if not exists public.element_bank (
  element_name text primary key, symbol text not null unique
);
create table if not exists public.sprint_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(), expires_at timestamptz not null,
  finished_at timestamptz, correct_count integer not null default 0, answered_count integer not null default 0,
  check(correct_count >= 0 and answered_count >= correct_count)
);
create table if not exists public.sprint_session_items (
  session_id uuid not null references public.sprint_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_number integer not null, element_name text not null references public.element_bank(element_name),
  answered_at timestamptz, is_correct boolean, reward integer not null default 0,
  primary key(session_id, sequence_number), unique(session_id, element_name)
);
create table if not exists public.sprint_answers (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sprint_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, element_name text not null,
  answer_text text not null, is_correct boolean not null, reward integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','active','completed','declined')),
  current_turn uuid references public.profiles(id) on delete set null,
  turn_count integer not null default 0,
  challenger_hp integer not null default 30, opponent_hp integer not null default 30,
  challenger_guard integer not null default 0, opponent_guard integer not null default 0,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(challenger_id <> opponent_id)
);
create table if not exists public.battle_moves (
  id uuid primary key default gen_random_uuid(), battle_id uuid not null references public.battles(id) on delete cascade,
  move_number integer not null, user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.card_catalog(id), damage integer not null,
  hp_after integer not null, created_at timestamptz not null default now(),
  unique(battle_id, move_number), unique(battle_id, user_id, card_id)
);

insert into public.element_bank(element_name,symbol) values
 ('waterstof','H'),
 ('helium','He'),
 ('lithium','Li'),
 ('beryllium','Be'),
 ('boor','B'),
 ('koolstof','C'),
 ('stikstof','N'),
 ('zuurstof','O'),
 ('fluor','F'),
 ('neon','Ne'),
 ('natrium','Na'),
 ('magnesium','Mg'),
 ('aluminium','Al'),
 ('silicium','Si'),
 ('fosfor','P'),
 ('zwavel','S'),
 ('chloor','Cl'),
 ('argon','Ar'),
 ('kalium','K'),
 ('calcium','Ca'),
 ('scandium','Sc'),
 ('titaan','Ti'),
 ('vanadium','V'),
 ('chroom','Cr'),
 ('mangaan','Mn'),
 ('ijzer','Fe'),
 ('kobalt','Co'),
 ('nikkel','Ni'),
 ('koper','Cu'),
 ('zink','Zn'),
 ('gallium','Ga'),
 ('germanium','Ge'),
 ('arseen','As'),
 ('seleen','Se'),
 ('broom','Br'),
 ('krypton','Kr'),
 ('rubidium','Rb'),
 ('strontium','Sr'),
 ('yttrium','Y'),
 ('zirkonium','Zr'),
 ('niobium','Nb'),
 ('molybdeen','Mo'),
 ('technetium','Tc'),
 ('ruthenium','Ru'),
 ('rhodium','Rh'),
 ('palladium','Pd'),
 ('zilver','Ag'),
 ('cadmium','Cd'),
 ('indium','In'),
 ('tin','Sn'),
 ('antimoon','Sb'),
 ('telluur','Te'),
 ('jood','I'),
 ('xenon','Xe'),
 ('cesium','Cs'),
 ('barium','Ba'),
 ('lanthaan','La'),
 ('cerium','Ce'),
 ('praseodymium','Pr'),
 ('neodymium','Nd'),
 ('promethium','Pm'),
 ('samarium','Sm'),
 ('europium','Eu'),
 ('gadolinium','Gd'),
 ('terbium','Tb'),
 ('dysprosium','Dy'),
 ('holmium','Ho'),
 ('erbium','Er'),
 ('thulium','Tm'),
 ('ytterbium','Yb'),
 ('lutetium','Lu'),
 ('hafnium','Hf'),
 ('tantaal','Ta'),
 ('wolfraam','W'),
 ('rhenium','Re'),
 ('osmium','Os'),
 ('iridium','Ir'),
 ('platina','Pt'),
 ('goud','Au'),
 ('kwik','Hg'),
 ('thallium','Tl'),
 ('lood','Pb'),
 ('bismut','Bi'),
 ('polonium','Po'),
 ('astaat','At'),
 ('radon','Rn'),
 ('francium','Fr'),
 ('radium','Ra'),
 ('actinium','Ac'),
 ('thorium','Th'),
 ('protactinium','Pa'),
 ('uranium','U'),
 ('neptunium','Np'),
 ('plutonium','Pu'),
 ('americium','Am'),
 ('curium','Cm'),
 ('berkelium','Bk'),
 ('californium','Cf'),
 ('einsteinium','Es'),
 ('fermium','Fm'),
 ('mendelevium','Md'),
 ('nobelium','No'),
 ('lawrencium','Lr'),
 ('rutherfordium','Rf'),
 ('dubnium','Db'),
 ('seaborgium','Sg'),
 ('bohrium','Bh'),
 ('hassium','Hs'),
 ('meitnerium','Mt'),
 ('darmstadtium','Ds'),
 ('röntgenium','Rg'),
 ('copernicium','Cn'),
 ('nihonium','Nh'),
 ('flerovium','Fl'),
 ('moscovium','Mc'),
 ('livermorium','Lv'),
 ('tennessine','Ts'),
 ('oganesson','Og')
on conflict(element_name) do update set symbol=excluded.symbol;

insert into public.quiz_questions(question_id,level_id,object_id,question_text,options,correct_answer,question_type) values
 ('m1','medieval','object1','Welke omschrijving past het best bij een mengsel?','["Een stof met maar één soort deeltje","Twee of meer stoffen samen","Altijd een vaste stof","Een stof die niet kan veranderen"]'::jsonb,1,'multiple_choice'),
 ('m2','medieval','object1','Wat was een belangrijk doel van veel alchemisten?','["Elektriciteit opwekken","Metalen proberen om te zetten in goud","Kunststoffen maken","Atomen fotograferen"]'::jsonb,1,'multiple_choice'),
 ('m3','medieval','object1','Hoeveel elementen staan er in de formule H₂O?','[]'::jsonb,2,'numeric'),
 ('l1','lavoisier','object1','Welke grootheid meet je met een balans?','["Temperatuur","Massa","Volume","Tijd"]'::jsonb,1,'multiple_choice'),
 ('l2','lavoisier','object1','Welke uitspraak past bij de wet van behoud van massa in een gesloten systeem?','["Massa verdwijnt bij verbranding","Massa ontstaat uit niets","De totale massa blijft gelijk","Alle stoffen worden gas"]'::jsonb,2,'multiple_choice'),
 ('l3','lavoisier','object1','Een gesloten proefopstelling heeft vóór een reactie een totale massa van 125 g. Wat is de totale massa na de reactie?','[]'::jsonb,125,'numeric'),
 ('n1','modern','object1','Welk deeltje heeft een negatieve elektrische lading?','["Proton","Neutron","Elektron","Atoomkern"]'::jsonb,2,'multiple_choice'),
 ('n2','modern','object1','Hoeveel mol water is 36 g water? Gebruik M(H₂O) = 18 g/mol.','[]'::jsonb,2,'numeric'),
 ('n3','modern','object1','Welk symbool hoort bij natrium?','["N","Na","Ne","Ni"]'::jsonb,1,'multiple_choice'),
 ('mx4','medieval','object2','Wat is een zuivere stof?','["Een stof met één soort deeltjes","Een mengsel van drie vloeistoffen","Altijd een gas","Een oplossing met zout"]'::jsonb,0,'multiple_choice'),
 ('mx5','medieval','object2','Welke toestandsverandering is smelten?','["Vast naar vloeibaar","Vloeibaar naar gas","Gas naar vloeibaar","Vloeibaar naar vast"]'::jsonb,0,'multiple_choice'),
 ('mx6','medieval','object2','Welk materiaal is een metaal?','["IJzer","Hout","Glas","Wol"]'::jsonb,0,'multiple_choice'),
 ('mx7','medieval','object3','Hoe noemen we een vloeistof waarin een stof is opgelost?','["Oplossing","Suspensie","Legering","Element"]'::jsonb,0,'multiple_choice'),
 ('mx8','medieval','object3','Welk symbool hoort bij zuurstof?','["O","Z","Zu","Ox"]'::jsonb,0,'multiple_choice'),
 ('mx9','medieval','object3','Hoeveel atomen zitten er in één molecuul O₂?','[]'::jsonb,2,'numeric'),
 ('mx10','medieval','object4','Welke methode kan zand van water scheiden?','["Filtreren","Smelten","Magnetiseren","Verdampen van het zand"]'::jsonb,0,'multiple_choice'),
 ('mx11','medieval','object4','Wat gebeurt er met de massa bij een chemische reactie in een gesloten systeem?','["Ze blijft behouden","Ze verdwijnt altijd","Ze verdubbelt","Ze wordt altijd nul"]'::jsonb,0,'multiple_choice'),
 ('lx4','lavoisier','object2','Welke eenheid gebruik je meestal voor massa in het labo?','["Gram","Liter","Seconde","Graad Celsius"]'::jsonb,0,'multiple_choice'),
 ('lx5','lavoisier','object2','Wat meet een thermometer?','["Temperatuur","Massa","Volume","Lengte"]'::jsonb,0,'multiple_choice'),
 ('lx6','lavoisier','object2','Welke grootheid druk je vaak uit in milliliter?','["Volume","Massa","Tijd","Temperatuur"]'::jsonb,0,'multiple_choice'),
 ('lx7','lavoisier','object3','Een monster heeft 40 g en je voegt 15 g toe. Wat is de totale massa?','[]'::jsonb,55,'numeric'),
 ('lx8','lavoisier','object3','Wat is een waarneming in een experiment?','["Wat je ziet of meet","Een willekeurige gok","Een verborgen code","Een conclusie zonder gegevens"]'::jsonb,0,'multiple_choice'),
 ('lx9','lavoisier','object3','Welke handeling verhoogt de betrouwbaarheid van een meting?','["De meting herhalen","Eenheden weglaten","Alle resultaten wissen","Alleen de beste uitkomst noteren"]'::jsonb,0,'multiple_choice'),
 ('lx10','lavoisier','object4','Wat is de correcte eenheid voor temperatuur in het SI-stelsel?','["Kelvin","Liter","Gram","Meter"]'::jsonb,0,'multiple_choice'),
 ('lx11','lavoisier','object4','Een maatcilinder bevat 25 mL en je voegt 10 mL toe. Wat is het volume?','[]'::jsonb,35,'numeric'),
 ('mx12','medieval','object4','Wat is het symbool voor goud?','["Au","Ag","Gd","Go"]'::jsonb,0,'multiple_choice'),
 ('lx12','lavoisier','object4','Hoeveel milligram is 1 gram?','[]'::jsonb,1000,'numeric'),
 ('modernx4','modern','object2','Wat is het symbool voor koolstof?','["C","K","Co","Ca"]'::jsonb,0,'multiple_choice'),
 ('modernx5','modern','object2','Welke deeltjes bevinden zich in de atoomkern?','["Protonen en neutronen","Alleen elektronen","Alleen moleculen","Elektronen en fotonen"]'::jsonb,0,'multiple_choice'),
 ('modernx6','modern','object2','Wat is de lading van een neutron?','["Neutraal","Positief","Negatief","Wisselt voortdurend"]'::jsonb,0,'multiple_choice'),
 ('modernx7','modern','object3','Hoeveel protonen heeft een koolstofatoom?','[]'::jsonb,6,'numeric'),
 ('modernx8','modern','object3','Welke formule hoort bij koolstofdioxide?','["CO₂","Co₂","C₂O","CaO"]'::jsonb,0,'multiple_choice'),
 ('modernx9','modern','object3','Wat is de pH van een neutrale oplossing bij kamertemperatuur?','[]'::jsonb,7,'numeric'),
 ('modernx10','modern','object4','Welke techniek scheidt vloeistoffen met verschillende kookpunten?','["Destillatie","Filtratie","Zeven","Magnetisme"]'::jsonb,0,'multiple_choice'),
 ('modernx11','modern','object4','Een oplossing bevat 2 mol stof in 1 L. Wat is de concentratie in mol/L?','[]'::jsonb,2,'numeric'),
 ('modernx12','modern','object4','Hoeveel neutronen heeft koolstof-12?','[]'::jsonb,6,'numeric')
on conflict(question_id) do update set level_id=excluded.level_id, object_id=excluded.object_id, question_text=excluded.question_text, options=excluded.options, correct_answer=excluded.correct_answer, question_type=excluded.question_type;


-- New accounts receive a starter avatar, 10 LabCoins, and five basic battle cards.
create or replace function public.handle_new_chemie_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_class_id uuid;
  v_role text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data->>'username',''));
  if v_username !~ '^[a-z0-9_-]{3,20}$' then
    raise exception 'Ongeldige gebruikersnaam. Accounts moeten door de leerkracht worden aangemaakt.';
  end if;
  begin v_class_id := (new.raw_user_meta_data->>'class_id')::uuid; exception when others then v_class_id := null; end;
  v_role := coalesce(new.raw_user_meta_data->>'role','student');
  if v_class_id is null or not exists(select 1 from public.classes where id=v_class_id) then
    raise exception 'Dit account moet aan een klas gekoppeld zijn.';
  end if;
  if v_role not in ('student','teacher') then raise exception 'Ongeldige accountrol.'; end if;
  insert into public.profiles(id, username, class_id, role, xp, coins, equipped_skin)
    values(new.id, v_username, v_class_id, v_role, 0, 10, 'starter');
  insert into public.user_skins(user_id,skin_id) values(new.id,'starter') on conflict do nothing;
  insert into public.user_cards(user_id,card_id)
    select new.id, id from public.card_catalog where id in ('hydrogen','helium','carbon','oxygen','iron')
    on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_chemie on auth.users;
create trigger on_auth_user_created_chemie after insert on auth.users
for each row execute procedure public.handle_new_chemie_user();

-- All exposed data tables use row-level security. Important balances can only change through RPCs.
alter table public.classes enable row level security;
alter table public.profiles enable row level security;
alter table public.user_skins enable row level security;
alter table public.user_cards enable row level security;
alter table public.card_catalog enable row level security;
alter table public.skin_catalog enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.question_awards enable row level security;
alter table public.element_bank enable row level security;
alter table public.sprint_sessions enable row level security;
alter table public.sprint_session_items enable row level security;
alter table public.sprint_answers enable row level security;
alter table public.battles enable row level security;
alter table public.battle_moves enable row level security;

drop policy if exists classes_same_class_read on public.classes;
create policy classes_same_class_read on public.classes for select to authenticated
  using (exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.class_id = classes.id));
grant select on public.classes to authenticated;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists skin_catalog_auth_read on public.skin_catalog;
create policy skin_catalog_auth_read on public.skin_catalog for select to authenticated using (true);
drop policy if exists card_catalog_auth_read on public.card_catalog;
create policy card_catalog_auth_read on public.card_catalog for select to authenticated using (true);
drop policy if exists user_skins_self_read on public.user_skins;
create policy user_skins_self_read on public.user_skins for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_cards_self_read on public.user_cards;
create policy user_cards_self_read on public.user_cards for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists question_awards_self_read on public.question_awards;
create policy question_awards_self_read on public.question_awards for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists sprint_sessions_self_read on public.sprint_sessions;
create policy sprint_sessions_self_read on public.sprint_sessions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists sprint_items_self_read on public.sprint_session_items;
create policy sprint_items_self_read on public.sprint_session_items for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists sprint_answers_self_read on public.sprint_answers;
create policy sprint_answers_self_read on public.sprint_answers for select to authenticated using (user_id = (select auth.uid()));
-- Security-definer helper allows RLS to check both battle participants' class without exposing profiles.
create or replace function public.is_battle_participant_same_class(p_battle_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.battles b
    join public.profiles me on me.id=auth.uid()
    join public.profiles opponent on opponent.id=case when b.challenger_id=me.id then b.opponent_id else b.challenger_id end
    where b.id=p_battle_id
      and auth.uid() is not null
      and auth.uid() in (b.challenger_id,b.opponent_id)
      and me.class_id is not null
      and opponent.class_id=me.class_id
      and me.role='student' and opponent.role='student'
  );
$$;
drop policy if exists battles_participant_read on public.battles;
create policy battles_participant_read on public.battles for select to authenticated using (public.is_battle_participant_same_class(id));
drop policy if exists battle_moves_participant_read on public.battle_moves;
create policy battle_moves_participant_read on public.battle_moves for select to authenticated using (public.is_battle_participant_same_class(battle_id));

-- Revoke direct writes (no policies allow these anyway; explicit revokes make intent clear).
revoke all on public.classes, public.profiles, public.user_skins, public.user_cards, public.card_catalog, public.skin_catalog,
 public.quiz_questions, public.question_awards, public.element_bank, public.sprint_sessions,
 public.sprint_session_items, public.sprint_answers, public.battles, public.battle_moves from anon, authenticated;
grant select on public.classes, public.profiles, public.user_skins, public.user_cards, public.card_catalog, public.skin_catalog,
 public.question_awards, public.sprint_sessions, public.sprint_session_items, public.sprint_answers,
 public.battles, public.battle_moves to authenticated;

create or replace function public.get_leaderboard(p_limit integer default 10)
returns table(position bigint, username text, xp integer, level integer)
language plpgsql stable security definer set search_path=public as $$
declare v_class_id uuid;
begin
 if auth.uid() is null then raise exception 'Meld je eerst aan.'; end if;
 select p.class_id into v_class_id from public.profiles p where p.id=auth.uid();
 if v_class_id is null then raise exception 'Je account is nog niet aan een klas gekoppeld.'; end if;
 return query
   select row_number() over(order by p.xp desc, p.created_at asc), p.username, p.xp, (p.xp / 100) + 1
   from public.profiles p
   where p.class_id=v_class_id and p.role='student'
   order by p.xp desc, p.created_at asc
   limit least(greatest(coalesce(p_limit,10),1),50);
end; $$;

create or replace function public.record_quiz_answer(p_question_id text, p_answer integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_correct_answer integer; v_correct boolean; v_awarded integer := 0; v_xp integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select correct_answer into v_correct_answer from public.quiz_questions where question_id=p_question_id;
 if not found then raise exception 'Onbekende vraag.'; end if;
 v_correct := (p_answer = v_correct_answer);
 if v_correct then
  insert into public.question_awards(user_id,question_id,xp_awarded) values(v_uid,p_question_id,5) on conflict do nothing;
  if found then v_awarded := 5; update public.profiles set xp=xp+v_awarded where id=v_uid; end if;
 end if;
 select xp into v_xp from public.profiles where id=v_uid;
 return jsonb_build_object('ok',true,'correct',v_correct,'xp_awarded',v_awarded,'xp',v_xp);
end; $$;

create or replace function public.start_element_sprint()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_session uuid; v_items jsonb;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 -- Prevent several simultaneously-running sessions for the same account.
 update public.sprint_sessions set finished_at=coalesce(finished_at,now()) where user_id=v_uid and finished_at is null and expires_at < now();
 if exists(select 1 from public.sprint_sessions where user_id=v_uid and finished_at is null and expires_at >= now()) then
  raise exception 'Je hebt al een Elementensprint lopen.';
 end if;
 insert into public.sprint_sessions(user_id,expires_at) values(v_uid,now()+interval '60 seconds') returning id into v_session;
 insert into public.sprint_session_items(session_id,user_id,sequence_number,element_name)
 select v_session,v_uid,row_number() over(order by random()),element_name from public.element_bank;
 select jsonb_agg(element_name order by sequence_number) into v_items from public.sprint_session_items where session_id=v_session;
 return jsonb_build_object('ok',true,'session_id',v_session,'items',v_items,'expires_at',(select expires_at from public.sprint_sessions where id=v_session));
end; $$;

create or replace function public.submit_element_answer(p_session_id uuid,p_element_name text,p_symbol text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.sprint_sessions%rowtype; v_i public.sprint_session_items%rowtype;
 v_symbol text; v_correct boolean; v_reward integer:=0; v_new_correct integer; v_new_answered integer; v_coins integer; v_xp integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_s from public.sprint_sessions where id=p_session_id and user_id=v_uid for update;
 if not found then raise exception 'Sprint niet gevonden.'; end if;
 if v_s.finished_at is not null then raise exception 'Deze sprint is al afgelopen.'; end if;
 if now() > v_s.expires_at then raise exception 'De minuut is voorbij.'; end if;
 select * into v_i from public.sprint_session_items where session_id=v_s.id and sequence_number=v_s.answered_count+1 for update;
 if not found then raise exception 'Er zijn geen vragen meer in deze sprint.'; end if;
 if p_element_name is distinct from v_i.element_name then raise exception 'De vraagvolgorde klopt niet. Herlaad de sprint.'; end if;
 select symbol into v_symbol from public.element_bank where element_name=v_i.element_name;
 v_correct := (p_symbol = v_symbol);
 if v_correct then v_reward := floor(v_s.correct_count::numeric / 5)::integer + 1; end if;
 v_new_correct := v_s.correct_count + case when v_correct then 1 else 0 end;
 v_new_answered := v_s.answered_count + 1;
 update public.sprint_session_items set answered_at=now(),is_correct=v_correct,reward=v_reward where session_id=v_s.id and sequence_number=v_i.sequence_number;
 insert into public.sprint_answers(session_id,user_id,element_name,answer_text,is_correct,reward) values(v_s.id,v_uid,v_i.element_name,coalesce(p_symbol,''),v_correct,v_reward);
 update public.sprint_sessions set correct_count=v_new_correct,answered_count=v_new_answered where id=v_s.id;
 update public.profiles set coins=coins+v_reward, xp=xp+case when v_correct then 2 else 0 end where id=v_uid returning coins,xp into v_coins,v_xp;
 return jsonb_build_object('ok',true,'correct',v_correct,'symbol',v_symbol,'reward',v_reward,'correct_count',v_new_correct,'answered_count',v_new_answered,'coins',v_coins,'xp',v_xp,'expires_at',v_s.expires_at);
end; $$;

create or replace function public.finish_element_sprint(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.sprint_sessions%rowtype; v_coins integer; v_xp integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_s from public.sprint_sessions where id=p_session_id and user_id=v_uid for update;
 if not found then raise exception 'Sprint niet gevonden.'; end if;
 if now() < v_s.expires_at then raise exception 'De minuut loopt nog.'; end if;
 update public.sprint_sessions set finished_at=coalesce(finished_at,now()) where id=v_s.id;
 select coins,xp into v_coins,v_xp from public.profiles where id=v_uid;
 return jsonb_build_object('ok',true,'correct_count',v_s.correct_count,'answered_count',v_s.answered_count,'coins',v_coins,'xp',v_xp);
end; $$;

create or replace function public.buy_card(p_card_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_price integer; v_coins integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select price into v_price from public.card_catalog where id=p_card_id;
 if not found then raise exception 'Deze kaart bestaat niet.'; end if;
 if exists(select 1 from public.user_cards where user_id=v_uid and card_id=p_card_id) then raise exception 'Je bezit deze kaart al.'; end if;
 select coins into v_coins from public.profiles where id=v_uid for update;
 if v_coins < v_price then raise exception 'Je hebt niet genoeg LabCoins.'; end if;
 update public.profiles set coins=coins-v_price where id=v_uid returning coins into v_coins;
 insert into public.user_cards(user_id,card_id) values(v_uid,p_card_id);
 return jsonb_build_object('ok',true,'card_id',p_card_id,'coins',v_coins);
end; $$;

create or replace function public.buy_skin(p_skin_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_price integer; v_coins integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select price into v_price from public.skin_catalog where id=p_skin_id;
 if not found then raise exception 'Deze skin bestaat niet.'; end if;
 if exists(select 1 from public.user_skins where user_id=v_uid and skin_id=p_skin_id) then raise exception 'Je bezit deze skin al.'; end if;
 select coins into v_coins from public.profiles where id=v_uid for update;
 if v_coins < v_price then raise exception 'Je hebt niet genoeg LabCoins.'; end if;
 update public.profiles set coins=coins-v_price,equipped_skin=p_skin_id where id=v_uid returning coins into v_coins;
 insert into public.user_skins(user_id,skin_id) values(v_uid,p_skin_id);
 return jsonb_build_object('ok',true,'skin_id',p_skin_id,'coins',v_coins,'equipped_skin',p_skin_id);
end; $$;

create or replace function public.equip_skin(p_skin_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_coins integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 if not exists(select 1 from public.user_skins where user_id=v_uid and skin_id=p_skin_id) then raise exception 'Je hebt deze skin nog niet gekocht.'; end if;
 update public.profiles set equipped_skin=p_skin_id where id=v_uid returning coins into v_coins;
 return jsonb_build_object('ok',true,'skin_id',p_skin_id,'coins',v_coins,'equipped_skin',p_skin_id);
end; $$;

create or replace function public.create_battle(p_opponent_username text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_uid uuid:=auth.uid(); v_opponent uuid; v_battle uuid; v_name text;
 v_class_id uuid; v_opponent_class_id uuid; v_role text; v_opponent_role text;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select class_id,role into v_class_id,v_role from public.profiles where id=v_uid;
 if v_class_id is null then raise exception 'Je account is niet aan een klas gekoppeld.'; end if;
 if v_role <> 'student' then raise exception 'Alleen leerlingen kunnen battles starten.'; end if;
 select id,username,class_id,role into v_opponent,v_name,v_opponent_class_id,v_opponent_role
   from public.profiles where username=lower(trim(p_opponent_username)) and class_id=v_class_id and role='student';
 if not found then raise exception 'Geen klasgenoot gevonden met die gebruikersnaam.'; end if;
 if v_opponent=v_uid then raise exception 'Je kunt jezelf niet uitdagen.'; end if;
 if exists(select 1 from public.battles where status in ('pending','active') and (challenger_id=v_uid or opponent_id=v_uid) and (challenger_id=v_opponent or opponent_id=v_opponent)) then raise exception 'Er loopt al een uitdaging of battle met deze klasgenoot.'; end if;
 insert into public.battles(challenger_id,opponent_id,status,current_turn) values(v_uid,v_opponent,'pending',v_uid) returning id into v_battle;
 return jsonb_build_object('ok',true,'battle_id',v_battle,'opponent',v_name);
end; $$;

create or replace function public.respond_to_battle(p_battle_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_b public.battles%rowtype;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_b from public.battles where id=p_battle_id for update;
 if not found then raise exception 'Battle niet gevonden.'; end if;
 if not public.is_battle_participant_same_class(v_b.id) then raise exception 'Deze battle is niet beschikbaar buiten je klas.'; end if;
 if v_b.opponent_id<>v_uid then raise exception 'Alleen de uitgedaagde speler kan antwoorden.'; end if;
 if v_b.status<>'pending' then raise exception 'Deze uitdaging is niet meer open.'; end if;
 if p_accept then update public.battles set status='active',current_turn=challenger_id,updated_at=now() where id=v_b.id;
 else update public.battles set status='declined',current_turn=null,updated_at=now() where id=v_b.id; end if;
 return jsonb_build_object('ok',true,'status',case when p_accept then 'active' else 'declined' end,'battle_id',v_b.id);
end; $$;

create or replace function public.play_battle_card(p_battle_id uuid,p_card_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_b public.battles%rowtype; v_c public.card_catalog%rowtype;
 v_challenger_turn boolean; v_damage integer; v_turn_count integer; v_chp integer; v_ohp integer; v_cguard integer; v_oguard integer;
 v_status text; v_next uuid; v_winner uuid; v_xp_you integer:=0; v_xp_other integer:=0;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_b from public.battles where id=p_battle_id for update;
 if not found then raise exception 'Battle niet gevonden.'; end if;
 if not public.is_battle_participant_same_class(v_b.id) then raise exception 'Deze battle is niet beschikbaar buiten je klas.'; end if;
 if v_b.status<>'active' then raise exception 'Deze battle is niet actief.'; end if;
 if v_uid not in (v_b.challenger_id,v_b.opponent_id) then raise exception 'Je neemt niet deel aan deze battle.'; end if;
 if v_b.current_turn<>v_uid then raise exception 'Het is nog niet jouw beurt.'; end if;
 select c.* into v_c from public.card_catalog c join public.user_cards uc on uc.card_id=c.id where uc.user_id=v_uid and c.id=p_card_id;
 if not found then raise exception 'Je bezit deze kaart niet.'; end if;
 if exists(select 1 from public.battle_moves where battle_id=v_b.id and user_id=v_uid and card_id=p_card_id) then raise exception 'Deze kaart heb je al gespeeld in deze battle.'; end if;
 v_chp:=v_b.challenger_hp; v_ohp:=v_b.opponent_hp; v_cguard:=v_b.challenger_guard; v_oguard:=v_b.opponent_guard;
 v_challenger_turn := (v_uid=v_b.challenger_id);
 if v_challenger_turn then
   v_damage:=greatest(1,v_c.attack-v_oguard); v_ohp:=greatest(0,v_ohp-v_damage); v_cguard:=v_c.shield;
 else
   v_damage:=greatest(1,v_c.attack-v_cguard); v_chp:=greatest(0,v_chp-v_damage); v_oguard:=v_c.shield;
 end if;
 v_turn_count:=v_b.turn_count+1; v_status:='active'; v_winner:=null;
 if v_chp=0 or v_ohp=0 or v_turn_count>=10 then
   v_status:='completed';
   if v_chp>v_ohp then v_winner:=v_b.challenger_id; elsif v_ohp>v_chp then v_winner:=v_b.opponent_id; end if;
   v_next:=null;
 else
   v_next:=case when v_challenger_turn then v_b.opponent_id else v_b.challenger_id end;
 end if;
 insert into public.battle_moves(battle_id,move_number,user_id,card_id,damage,hp_after)
 values(v_b.id,v_turn_count,v_uid,p_card_id,v_damage,case when v_challenger_turn then v_ohp else v_chp end);
 update public.battles set challenger_hp=v_chp,opponent_hp=v_ohp,challenger_guard=v_cguard,opponent_guard=v_oguard,
   turn_count=v_turn_count,current_turn=v_next,status=v_status,winner_id=v_winner,updated_at=now() where id=v_b.id;
 if v_status='completed' then
   if v_winner is null then
     update public.profiles set xp=xp+25 where id in (v_b.challenger_id,v_b.opponent_id);
     v_xp_you:=25; v_xp_other:=25;
   else
     update public.profiles set xp=xp+case when id=v_winner then 50 else 15 end where id in (v_b.challenger_id,v_b.opponent_id);
     if v_winner=v_uid then v_xp_you:=50; v_xp_other:=15; else v_xp_you:=15; v_xp_other:=50; end if;
   end if;
 end if;
 return jsonb_build_object('ok',true,'status',v_status,'turn_count',v_turn_count,'damage',v_damage,'challenger_hp',v_chp,'opponent_hp',v_ohp,'winner_id',v_winner,'current_turn',v_next,'xp_you',v_xp_you,'xp_other',v_xp_other);
end; $$;

-- Restrict RPC execution to logged-in users. Security-definer functions still validate auth.uid().
revoke all on function public.is_battle_participant_same_class(uuid) from public, anon;
revoke all on function public.get_leaderboard(integer) from public, anon;
revoke all on function public.record_quiz_answer(text,integer) from public, anon;
revoke all on function public.start_element_sprint() from public, anon;
revoke all on function public.submit_element_answer(uuid,text,text) from public, anon;
revoke all on function public.finish_element_sprint(uuid) from public, anon;
revoke all on function public.buy_card(text) from public, anon;
revoke all on function public.buy_skin(text) from public, anon;
revoke all on function public.equip_skin(text) from public, anon;
revoke all on function public.create_battle(text) from public, anon;
revoke all on function public.respond_to_battle(uuid,boolean) from public, anon;
revoke all on function public.play_battle_card(uuid,text) from public, anon;
grant execute on function public.is_battle_participant_same_class(uuid) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
grant execute on function public.record_quiz_answer(text,integer) to authenticated;
grant execute on function public.start_element_sprint() to authenticated;
grant execute on function public.submit_element_answer(uuid,text,text) to authenticated;
grant execute on function public.finish_element_sprint(uuid) to authenticated;
grant execute on function public.buy_card(text) to authenticated;
grant execute on function public.buy_skin(text) to authenticated;
grant execute on function public.equip_skin(text) to authenticated;
grant execute on function public.create_battle(text) to authenticated;
grant execute on function public.respond_to_battle(uuid,boolean) to authenticated;
grant execute on function public.play_battle_card(uuid,text) to authenticated;

-- Realtime updates are optional but recommended for battle notifications.
-- In Supabase Dashboard -> Database -> Replication, enable the public.battles table for Realtime.


-- Return only battles involving the current signed-in player, including public usernames.
create or replace function public.get_my_battles()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'battle_id',b.id,'challenger_id',b.challenger_id,'opponent_id',b.opponent_id,
   'challenger_username',cp.username,'opponent_username',op.username,'status',b.status,
   'current_turn',b.current_turn,'turn_count',b.turn_count,
   'challenger_hp',b.challenger_hp,'opponent_hp',b.opponent_hp,
   'challenger_guard',b.challenger_guard,'opponent_guard',b.opponent_guard,
   'winner_id',b.winner_id,'created_at',b.created_at,'updated_at',b.updated_at
 ) order by b.updated_at desc), '[]'::jsonb)
 into v_result
 from public.battles b
 join public.profiles cp on cp.id=b.challenger_id
 join public.profiles op on op.id=b.opponent_id
 join public.profiles me on me.id=v_uid
 where v_uid in (b.challenger_id,b.opponent_id)
   and cp.class_id=me.class_id and op.class_id=me.class_id
   and cp.role='student' and op.role='student';
 return v_result;
end; $$;

revoke all on function public.get_my_battles() from public, anon;
grant execute on function public.get_my_battles() to authenticated;
