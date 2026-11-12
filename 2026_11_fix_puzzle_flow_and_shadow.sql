-- Chemie Escape Room: herstel van vaste moeilijkheidskeuze per puzzel en Schaduw-drops.
-- Vereist: schema.sql + de eerdere vier-level- en moeilijkheid/herhalingsmigraties.
-- Deze migratie is idempotent en kan opnieuw worden uitgevoerd.

-- -----------------------------------------------------------------------------
-- 1. Eén open poging per leerling + puzzelplek.
--    Als oudere versies meerdere onafgewerkte moeilijkheidskeuzes hebben aangemaakt,
--    blijft de meest recente poging behouden. Oudere pogingen worden afgesloten
--    zonder XP of LabCoins toe te kennen.
-- -----------------------------------------------------------------------------
with ranked_open_attempts as (
  select id,
         row_number() over (
           partition by user_id, level_id, object_id
           order by started_at desc, id desc
         ) as rn
  from public.puzzle_attempts
  where completed_at is null
)
update public.puzzle_attempts a
set completed_at = clock_timestamp()
from ranked_open_attempts r
where a.id = r.id and r.rn > 1;

create unique index if not exists puzzle_attempts_one_open_per_puzzle_idx
  on public.puzzle_attempts(user_id, level_id, object_id)
  where completed_at is null;

-- Ophalen van een bestaande poging, zodat een leerling na sluiten/herladen
-- dezelfde moeilijkheid en exact dezelfde vraagselectie kan hervatten.
create or replace function public.get_my_active_puzzle_attempt(
  p_level_id text,
  p_object_id text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_attempt public.puzzle_attempts%rowtype;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then raise exception 'Alleen leerlingen kunnen puzzelpogingen hervatten.'; end if;
  if p_level_id not in ('medieval','lavoisier','modern','future')
     or p_object_id not in ('object1','object2','object3','object4') then
    raise exception 'Ongeldig leerjaar of puzzelplek.';
  end if;

  select * into v_attempt
  from public.puzzle_attempts
  where user_id = v_uid
    and level_id = p_level_id
    and object_id = p_object_id
    and completed_at is null
  order by started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'has_attempt', false);
  end if;

  select jsonb_agg(jsonb_build_object(
    'question_id', q.question_id,
    'question_type', q.question_type,
    'question_text', q.question_text,
    'options', q.options
  ) order by x.ordinality)
  into v_items
  from unnest(v_attempt.question_ids) with ordinality as x(question_id, ordinality)
  join public.quiz_questions q on q.question_id = x.question_id;

  return jsonb_build_object(
    'ok', true,
    'has_attempt', true,
    'attempt_id', v_attempt.id,
    'level_id', v_attempt.level_id,
    'object_id', v_attempt.object_id,
    'difficulty', v_attempt.difficulty,
    'required_count', v_attempt.required_count,
    'correct_question_ids', to_jsonb(v_attempt.correct_question_ids),
    'correct_count', cardinality(v_attempt.correct_question_ids),
    'questions', coalesce(v_items, '[]'::jsonb),
    'resumed', true
  );
end;
$$;

-- Start een nieuwe poging, of hervat de bestaande poging ongeacht welke
-- moeilijkheid de leerling nu in de browser zou proberen te kiezen.
create or replace function public.start_puzzle_attempt(
  p_level_id text,
  p_object_id text,
  p_difficulty text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_required integer;
  v_available integer;
  v_attempt public.puzzle_attempts%rowtype;
  v_ids text[];
  v_items jsonb;
  v_resume boolean := false;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then raise exception 'Alleen leerlingaccounts kunnen puzzels starten.'; end if;
  if p_level_id not in ('medieval','lavoisier','modern','future')
     or p_object_id not in ('object1','object2','object3','object4') then
    raise exception 'Ongeldig leerjaar of puzzelplek.';
  end if;
  if p_difficulty not in ('basis','gemiddeld','moeilijk') then
    raise exception 'Kies een geldige moeilijkheidsgraad.';
  end if;
  if not exists (
    select 1 from public.user_level_unlocks
    where user_id = v_uid and level_id = p_level_id
  ) then
    raise exception 'Dit labo is nog niet vrijgespeeld. Open eerst de vorige tijdpoort.';
  end if;

  -- Belangrijk: een bestaande open poging wint altijd. De gekozen moeilijkheid
  -- wordt dus niet opnieuw gevraagd of gewijzigd tijdens een lopende reeks.
  select * into v_attempt
  from public.puzzle_attempts
  where user_id = v_uid
    and level_id = p_level_id
    and object_id = p_object_id
    and completed_at is null
  order by started_at desc
  limit 1
  for update;

  if found then
    v_resume := true;
    v_ids := v_attempt.question_ids;
  else
    select questions_required into v_required
    from public.puzzle_settings
    where level_id = p_level_id and object_id = p_object_id;
    v_required := coalesce(v_required, 3);

    select count(*) into v_available
    from public.quiz_questions
    where level_id = p_level_id
      and object_id = p_object_id
      and difficulty = p_difficulty
      and is_active = true;

    if v_available < v_required then
      raise exception 'Voor deze puzzel zijn % % vragen ingesteld, maar er zijn slechts % beschikbaar. Vraag je leerkracht om extra vragen toe te voegen of een lager aantal in te stellen.',
        v_required, p_difficulty, v_available;
    end if;

    select array_agg(s.question_id order by s.seen_before, s.random_order)
    into v_ids
    from (
      select q.question_id,
        exists (
          select 1 from public.puzzle_attempts old
          where old.user_id = v_uid
            and old.level_id = p_level_id
            and old.object_id = p_object_id
            and old.difficulty = p_difficulty
            and old.question_ids @> array[q.question_id]::text[]
        ) as seen_before,
        random() as random_order
      from public.quiz_questions q
      where q.level_id = p_level_id
        and q.object_id = p_object_id
        and q.difficulty = p_difficulty
        and q.is_active = true
      order by seen_before, random_order
      limit v_required
    ) s;

    insert into public.puzzle_attempts(
      user_id, level_id, object_id, difficulty, required_count, question_ids
    )
    values(v_uid, p_level_id, p_object_id, p_difficulty, v_required, v_ids)
    returning * into v_attempt;
  end if;

  select jsonb_agg(jsonb_build_object(
    'question_id', q.question_id,
    'question_type', q.question_type,
    'question_text', q.question_text,
    'options', q.options
  ) order by x.ordinality)
  into v_items
  from unnest(v_ids) with ordinality as x(question_id, ordinality)
  join public.quiz_questions q on q.question_id = x.question_id;

  return jsonb_build_object(
    'ok', true,
    'has_attempt', true,
    'attempt_id', v_attempt.id,
    'level_id', p_level_id,
    'object_id', p_object_id,
    'difficulty', v_attempt.difficulty,
    'required_count', v_attempt.required_count,
    'correct_question_ids', to_jsonb(v_attempt.correct_question_ids),
    'correct_count', cardinality(v_attempt.correct_question_ids),
    'questions', coalesce(v_items, '[]'::jsonb),
    'resumed', v_resume
  );
end;
$$;

revoke all on function public.get_my_active_puzzle_attempt(text,text) from public, anon;
revoke all on function public.start_puzzle_attempt(text,text,text) from public, anon;
grant execute on function public.get_my_active_puzzle_attempt(text,text) to authenticated;
grant execute on function public.start_puzzle_attempt(text,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Herstel/garandeer de databasefuncties voor de online Schaduw.
--    Deze functies waren wel in de gamecode aanwezig, maar ontbraken in de
--    laatste meegeleverde projectmap. Daarom kan een online Schaduw anders
--    niet verschijnen of geen materiaal veilig aan de inventaris toevoegen.
-- -----------------------------------------------------------------------------
create table if not exists public.player_materials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kno3_mol integer not null default 0 check (kno3_mol >= 0),
  carbon_mol integer not null default 0 check (carbon_mol >= 0),
  sulfur_mol integer not null default 0 check (sulfur_mol >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.shadow_encounters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_id text not null check (level_id in ('medieval','lavoisier','modern','future')),
  material text not null check (material in ('kno3','carbon','sulfur')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);
create index if not exists shadow_encounters_user_created_idx
  on public.shadow_encounters(user_id, created_at desc);

alter table public.player_materials enable row level security;
alter table public.shadow_encounters enable row level security;
revoke all on public.player_materials, public.shadow_encounters from public, anon, authenticated;

create or replace function public.get_my_materials()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.player_materials%rowtype;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  if not exists(select 1 from public.profiles p where p.id = v_uid and p.class_id is not null) then
    raise exception 'Je account is niet aan een klas gekoppeld.';
  end if;
  insert into public.player_materials(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_row from public.player_materials where user_id = v_uid;
  return jsonb_build_object('kno3',v_row.kno3_mol,'carbon',v_row.carbon_mol,'sulfur',v_row.sulfur_mol);
end;
$$;

create or replace function public.start_shadow_encounter(p_level_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid;
  v_active public.shadow_encounters%rowtype;
  v_last_created timestamptz;
  v_material text;
  v_encounter public.shadow_encounters%rowtype;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  if p_level_id not in ('medieval','lavoisier','modern','future') then raise exception 'Onbekend labo.'; end if;
  select class_id into v_class_id from public.profiles where id = v_uid for update;
  if not found or v_class_id is null then raise exception 'Je account is niet aan een klas gekoppeld.'; end if;

  select * into v_active
  from public.shadow_encounters
  where user_id = v_uid and claimed_at is null and expires_at > clock_timestamp()
  order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('ok',true,'encounter_id',v_active.id,'expires_at',v_active.expires_at,
      'visible_seconds',greatest(1,ceil(extract(epoch from (v_active.expires_at-clock_timestamp())))::integer));
  end if;

  select max(created_at) into v_last_created from public.shadow_encounters where user_id = v_uid;
  if v_last_created is not null and v_last_created > clock_timestamp() - interval '12 seconds' then
    raise exception 'De Schaduw is nog niet opnieuw verschenen. Kijk straks nog eens.';
  end if;

  v_material := (array['kno3','carbon','sulfur'])[1 + floor(random()*3)::integer];
  insert into public.shadow_encounters(user_id,level_id,material,expires_at)
  values(v_uid,p_level_id,v_material,clock_timestamp()+interval '10 seconds')
  returning * into v_encounter;
  return jsonb_build_object('ok',true,'encounter_id',v_encounter.id,'expires_at',v_encounter.expires_at,'visible_seconds',10);
end;
$$;

create or replace function public.collect_shadow_drop(p_encounter_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_enc public.shadow_encounters%rowtype;
  v_materials public.player_materials%rowtype;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  select * into v_enc from public.shadow_encounters
  where id = p_encounter_id and user_id = v_uid for update;
  if not found then raise exception 'Deze Schaduwverschijning bestaat niet.'; end if;
  if v_enc.claimed_at is not null then raise exception 'Deze grondstof werd al verzameld.'; end if;
  if v_enc.expires_at <= clock_timestamp() then raise exception 'Je was net te laat: de Schaduw is verdwenen.'; end if;

  update public.shadow_encounters set claimed_at = clock_timestamp() where id = v_enc.id;
  insert into public.player_materials(user_id) values(v_uid) on conflict(user_id) do nothing;
  update public.player_materials set
    kno3_mol = kno3_mol + case when v_enc.material='kno3' then 1 else 0 end,
    carbon_mol = carbon_mol + case when v_enc.material='carbon' then 1 else 0 end,
    sulfur_mol = sulfur_mol + case when v_enc.material='sulfur' then 1 else 0 end,
    updated_at = now()
  where user_id = v_uid;
  select * into v_materials from public.player_materials where user_id = v_uid;
  return jsonb_build_object('ok',true,'material',v_enc.material,'amount_mol',1,
    'inventory',jsonb_build_object('kno3',v_materials.kno3_mol,'carbon',v_materials.carbon_mol,'sulfur',v_materials.sulfur_mol));
end;
$$;

create or replace function public.blow_safe()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_materials public.player_materials%rowtype;
  v_coins integer;
begin
  if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
  if not exists(select 1 from public.profiles p where p.id = v_uid and p.class_id is not null) then
    raise exception 'Je account is niet aan een klas gekoppeld.';
  end if;
  insert into public.player_materials(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_materials from public.player_materials where user_id = v_uid for update;
  if v_materials.kno3_mol < 2 or v_materials.carbon_mol < 3 or v_materials.sulfur_mol < 1 then
    return jsonb_build_object('ok',false,'insufficient',true,
      'inventory',jsonb_build_object('kno3',v_materials.kno3_mol,'carbon',v_materials.carbon_mol,'sulfur',v_materials.sulfur_mol));
  end if;
  update public.player_materials set kno3_mol=kno3_mol-2,carbon_mol=carbon_mol-3,sulfur_mol=sulfur_mol-1,updated_at=now()
  where user_id = v_uid returning * into v_materials;
  update public.profiles set coins=coins+30 where id=v_uid returning coins into v_coins;
  return jsonb_build_object('ok',true,'coins',v_coins,'coins_awarded',30,
    'inventory',jsonb_build_object('kno3',v_materials.kno3_mol,'carbon',v_materials.carbon_mol,'sulfur',v_materials.sulfur_mol));
end;
$$;

revoke all on function public.get_my_materials() from public, anon;
revoke all on function public.start_shadow_encounter(text) from public, anon;
revoke all on function public.collect_shadow_drop(uuid) from public, anon;
revoke all on function public.blow_safe() from public, anon;
grant execute on function public.get_my_materials() to authenticated;
grant execute on function public.start_shadow_encounter(text) to authenticated;
grant execute on function public.collect_shadow_drop(uuid) to authenticated;
grant execute on function public.blow_safe() to authenticated;
