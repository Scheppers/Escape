-- Chemie Escape Room: leerjaar 4 + leerkrachtbeheer van de vragenbanken.
-- Voer dit script EENMALIG uit in Supabase > SQL Editor voor een bestaande installatie.

alter table public.quiz_questions
  add column if not exists is_active boolean not null default true;
create index if not exists quiz_questions_level_object_active_idx
  on public.quiz_questions(level_id, object_id, is_active);

-- Startset van 12 vragen voor het futuristische labo (3 vragen per puzzelplek).
insert into public.quiz_questions(question_id,level_id,object_id,question_text,options,correct_answer,question_type) values
 ('f1','future','object1','Welke binding ontstaat wanneer twee niet-metaalatomen elektronenparen delen?','["Ionbinding","Atoombinding","Metaalbinding","Waterstofbrug"]'::jsonb,1,'multiple_choice'),
 ('f2','future','object1','Welke deeltjes ontstaan wanneer een natriumatoom één elektron afstaat?','["Een natriumion met lading +1","Een natriumion met lading −1","Een neutraal natriumatoom","Een natriummolecuul"]'::jsonb,0,'multiple_choice'),
 ('f3','future','object1','Welke formule hoort bij de ionverbinding tussen Mg²⁺ en Cl⁻?','["MgCl","MgCl₂","Mg₂Cl","Mg₂Cl₂"]'::jsonb,1,'multiple_choice'),
 ('f4','future','object2','Wat doet een katalysator met een chemische reactie?','["Hij verhoogt de activeringsenergie","Hij wordt volledig opgebruikt","Hij verlaagt de activeringsenergie","Hij verandert de reactieproducten"]'::jsonb,2,'multiple_choice'),
 ('f5','future','object2','Hoe noem je een reactie waarbij energie aan de omgeving wordt afgegeven?','["Endotherm","Exotherm","Neutraal","Fotolytisch"]'::jsonb,1,'multiple_choice'),
 ('f6','future','object2','Een reactie duurt bij 20 °C 40 seconden. Bij hogere temperatuur duurt ze 20 seconden. Hoeveel keer sneller verloopt ze?','[]'::jsonb,2,'numeric'),
 ('f7','future','object3','Welke vergelijking is correct kloppend gemaakt voor de vorming van water?','["H₂ + O₂ → H₂O","2 H₂ + O₂ → 2 H₂O","H₂ + 2 O₂ → H₂O","2 H₂ + 2 O₂ → H₂O"]'::jsonb,1,'multiple_choice'),
 ('f8','future','object3','Hoeveel mol is 44 g koolstofdioxide? Gebruik M(CO₂) = 44 g/mol.','[]'::jsonb,1,'numeric'),
 ('f9','future','object3','Hoeveel gram water is 2 mol water? Gebruik M(H₂O) = 18 g/mol.','[]'::jsonb,36,'numeric'),
 ('f10','future','object4','Welke pH-waarde past bij een zure oplossing bij kamertemperatuur?','["pH 2","pH 7","pH 9","pH 14"]'::jsonb,0,'multiple_choice'),
 ('f11','future','object4','Wat ontstaat er bij de reactie tussen een zuur en een hydroxidebase?','["Alleen zuurstof","Een zout en water","Een metaal en waterstof","Altijd koolstofdioxide"]'::jsonb,1,'multiple_choice'),
 ('f12','future','object4','Een neutrale oplossing heeft bij 25 °C een pH van hoeveel?','[]'::jsonb,7,'numeric')
on conflict(question_id) do update set
  level_id=excluded.level_id, object_id=excluded.object_id,
  question_text=excluded.question_text, options=excluded.options,
  correct_answer=excluded.correct_answer, question_type=excluded.question_type,
  is_active=true;

-- Leerkracht en leerlingen lezen de actieve set via deze RPC. Directe tabeltoegang blijft gesloten.
create or replace function public.get_level_questions(p_level_id text)
returns table(
  question_id text, level_id text, object_id text, question_text text,
  options jsonb, correct_answer integer, question_type text
)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Meld je eerst aan.'; end if;
  if p_level_id not in ('medieval','lavoisier','modern','future') then
    raise exception 'Onbekend leerjaar.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.class_id is not null) then
    raise exception 'Je account is niet aan een klas gekoppeld.';
  end if;
  return query
    select q.question_id,q.level_id,q.object_id,q.question_text,q.options,q.correct_answer,q.question_type
    from public.quiz_questions q
    where q.level_id=p_level_id and q.is_active=true
    order by q.object_id,q.question_id;
end; $$;

-- Alleen een leerkracht mag inhoud van de globale leerjaar-vragensets aanmaken of wijzigen.
create or replace function public.teacher_save_quiz_question(
  p_question_id text, p_level_id text, p_object_id text,
  p_question_text text, p_options jsonb, p_correct_answer integer, p_question_type text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text; v_old_object text; v_old_active boolean; v_old_count integer;
begin
  if auth.uid() is null then raise exception 'Meld je eerst aan.'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role is distinct from 'teacher' then raise exception 'Alleen de leerkracht mag vragen aanpassen.'; end if;
  if p_level_id not in ('medieval','lavoisier','modern','future') then raise exception 'Onbekend leerjaar.'; end if;
  if p_object_id not in ('object1','object2','object3','object4') then raise exception 'Ongeldige puzzelplek.'; end if;
  if p_question_id is null or p_question_id !~ '^[a-zA-Z0-9_-]{2,64}$' then raise exception 'Ongeldig vraag-ID.'; end if;
  if p_question_text is null or length(trim(p_question_text)) < 5 or length(p_question_text) > 1000 then raise exception 'De vraag moet tussen 5 en 1000 tekens lang zijn.'; end if;
  if p_question_type = 'multiple_choice' then
    if jsonb_typeof(coalesce(p_options,'[]'::jsonb)) <> 'array' then raise exception 'Antwoordopties moeten een lijst zijn.'; end if;
    if jsonb_array_length(coalesce(p_options,'[]'::jsonb)) <> 4 then raise exception 'Een meerkeuzevraag heeft precies vier antwoordopties nodig.'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_options) as v(value) where length(trim(v.value))=0) then raise exception 'Antwoordopties mogen niet leeg zijn.'; end if;
    if p_correct_answer is null or p_correct_answer not between 0 and 3 then raise exception 'Kies een correct antwoord tussen optie 1 en 4.'; end if;
  elsif p_question_type = 'numeric' then
    if p_correct_answer is null then raise exception 'Vul een geheel getal als correct antwoord in.'; end if;
    p_options := '[]'::jsonb;
  else
    raise exception 'Ongeldig vraagtype.';
  end if;
  if exists(select 1 from public.quiz_questions where question_id=p_question_id and level_id<>p_level_id) then
    raise exception 'Een bestaande vraag kan niet naar een ander leerjaar worden verplaatst.';
  end if;
  select object_id,is_active into v_old_object,v_old_active from public.quiz_questions where question_id=p_question_id;
  if found and v_old_active=true and v_old_object<>p_object_id then
    select count(*) into v_old_count from public.quiz_questions where level_id=p_level_id and object_id=v_old_object and is_active=true;
    if v_old_count <= 3 then raise exception 'Deze vraag kan niet naar een andere puzzelplek: de huidige plek moet minstens drie actieve vragen behouden.'; end if;
  end if;
  insert into public.quiz_questions(question_id,level_id,object_id,question_text,options,correct_answer,question_type,is_active)
  values(p_question_id,p_level_id,p_object_id,trim(p_question_text),coalesce(p_options,'[]'::jsonb),p_correct_answer,p_question_type,true)
  on conflict(question_id) do update set
    object_id=excluded.object_id, question_text=excluded.question_text,
    options=excluded.options, correct_answer=excluded.correct_answer,
    question_type=excluded.question_type, is_active=true;
  return jsonb_build_object('ok',true,'question_id',p_question_id,'level_id',p_level_id);
end; $$;

-- Archiveer i.p.v. echt verwijderen: reeds toegekende XP blijft zo behouden.
-- Per puzzelplek moeten minstens drie actieve vragen overblijven.
create or replace function public.teacher_archive_quiz_question(p_question_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text; v_level text; v_object text; v_count integer;
begin
  if auth.uid() is null then raise exception 'Meld je eerst aan.'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role is distinct from 'teacher' then raise exception 'Alleen de leerkracht mag vragen archiveren.'; end if;
  select level_id,object_id into v_level,v_object from public.quiz_questions where question_id=p_question_id and is_active=true;
  if not found then raise exception 'Vraag niet gevonden of al gearchiveerd.'; end if;
  select count(*) into v_count from public.quiz_questions where level_id=v_level and object_id=v_object and is_active=true;
  if v_count <= 3 then raise exception 'Elke puzzelplek moet minstens drie actieve vragen behouden.'; end if;
  update public.quiz_questions set is_active=false where question_id=p_question_id;
  return jsonb_build_object('ok',true,'question_id',p_question_id,'archived',true);
end; $$;

-- Servercontrole gebruikt uitsluitend actieve vragen.
create or replace function public.record_quiz_answer(p_question_id text, p_answer integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_correct_answer integer; v_correct boolean; v_awarded integer := 0; v_xp integer;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  select correct_answer into v_correct_answer from public.quiz_questions
  where question_id=p_question_id and is_active=true;
  if not found then raise exception 'Onbekende of niet-actieve vraag.'; end if;
  v_correct := (p_answer = v_correct_answer);
  if v_correct then
    insert into public.question_awards(user_id,question_id,xp_awarded)
    values(v_uid,p_question_id,5) on conflict do nothing;
    if found then v_awarded := 5; update public.profiles set xp=xp+v_awarded where id=v_uid; end if;
  end if;
  select xp into v_xp from public.profiles where id=v_uid;
  return jsonb_build_object('ok',true,'correct',v_correct,'xp_awarded',v_awarded,'xp',v_xp);
end; $$;

revoke all on function public.get_level_questions(text) from public, anon;
revoke all on function public.teacher_save_quiz_question(text,text,text,text,jsonb,integer,text) from public, anon;
revoke all on function public.teacher_archive_quiz_question(text) from public, anon;
revoke all on function public.record_quiz_answer(text,integer) from public, anon;
grant execute on function public.get_level_questions(text) to authenticated;
grant execute on function public.teacher_save_quiz_question(text,text,text,text,jsonb,integer,text) to authenticated;
grant execute on function public.teacher_archive_quiz_question(text) to authenticated;
grant execute on function public.record_quiz_answer(text,integer) to authenticated;
