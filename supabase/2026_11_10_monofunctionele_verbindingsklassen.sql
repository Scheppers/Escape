-- Monofunctionele verbindingsklassen: eigen vragenbank, beveiligde sessies en beloningen.
-- Voer uit NA de bestaande bonusspellen-migraties. Bestaande gegevens blijven intact.
create table if not exists public.mono_questions (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 160),
 alternative_name text not null default '',
 category text not null check(category in ('alkeen','alkyn','halogeenalkaan','alcohol','ether','aldehyde','keton','carbonzuur','ester','amine','amide')),
 model jsonb not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.mono_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('group','name','draw','alkane')),
 question_ids uuid[] not null,
 answered integer not null default 0,
 correct integer not null default 0,
 coins_earned integer not null default 0,
 expires_at timestamptz,
 finished_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists mono_sessions_user_idx on public.mono_sessions(user_id,created_at desc);
alter table public.mono_questions enable row level security;
alter table public.mono_sessions enable row level security;
drop policy if exists mono_questions_teacher on public.mono_questions;
create policy mono_questions_teacher on public.mono_questions for all to authenticated
 using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'))
 with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
drop policy if exists mono_sessions_owner on public.mono_sessions;
create policy mono_sessions_owner on public.mono_sessions for select to authenticated using(user_id=auth.uid());
grant select,insert,update,delete on public.mono_questions to authenticated;
grant select on public.mono_sessions to authenticated;

-- Normaliseer de tekening: alleen expliciet getekende H aan C mogen weggelaten worden.
-- H aan O, N of andere heteroatomen blijft verplicht en wordt niet weggelaten.
create or replace function public.mono_normalize_graph(p_graph jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare a jsonb; b jsonb; n integer; i integer; j integer; k integer; new_index integer:=0;
 mapping integer[]:=array[]::integer[]; atoms jsonb:='[]'::jsonb; bonds jsonb:='[]'::jsonb;
 degree integer; neighbor integer; bond_order integer;
begin
 if jsonb_typeof(p_graph->'atoms')<>'array' or jsonb_typeof(p_graph->'bonds')<>'array' then return null; end if;
 n:=jsonb_array_length(p_graph->'atoms');
 if n<1 or n>32 or jsonb_array_length(p_graph->'bonds')>64 then return null; end if;
 for i in 0..n-1 loop
  a:=p_graph->'atoms'->i;
  if a->>'element' not in ('C','H','O','N','F','Cl','Br','I','S','P') then return null; end if;
  degree:=0; neighbor:=-1; bond_order:=0;
  for b in select value from jsonb_array_elements(p_graph->'bonds') loop
   if jsonb_typeof(b->'a')<>'number' or jsonb_typeof(b->'b')<>'number' or jsonb_typeof(b->'order')<>'number' then return null; end if;
   j:=(b->>'a')::integer; k:=(b->>'b')::integer;
   if j<0 or k<0 or j>=n or k>=n or j=k or (b->>'order')::integer not between 1 and 3 then return null; end if;
   if j=i or k=i then degree:=degree+1;neighbor:=case when j=i then k else j end;bond_order:=(b->>'order')::integer; end if;
  end loop;
  if a->>'element'='H' and degree=1 and bond_order=1 and p_graph->'atoms'->neighbor->>'element'='C' then
    mapping:=mapping||(-1);
  else
    mapping:=mapping||new_index;
    atoms:=atoms||jsonb_build_array(jsonb_build_object('element',a->>'element'));
    new_index:=new_index+1;
  end if;
 end loop;
 for b in select value from jsonb_array_elements(p_graph->'bonds') loop
  i:=(b->>'a')::integer;j:=(b->>'b')::integer;
  if mapping[i+1]>=0 and mapping[j+1]>=0 then
   if exists(select 1 from jsonb_array_elements(bonds) x where least((x->>'a')::int,(x->>'b')::int)=least(mapping[i+1],mapping[j+1]) and greatest((x->>'a')::int,(x->>'b')::int)=greatest(mapping[i+1],mapping[j+1])) then return null; end if;
   bonds:=bonds||jsonb_build_array(jsonb_build_object('a',mapping[i+1],'b',mapping[j+1],'order',(b->>'order')::int));
  end if;
 end loop;
 -- Valentie: C maximaal vier bindingseenheden; H precies één.
 for i in 0..jsonb_array_length(atoms)-1 loop
  select coalesce(sum((x->>'order')::int),0) into degree from jsonb_array_elements(bonds) x where (x->>'a')::int=i or (x->>'b')::int=i;
  if (atoms->i->>'element'='C' and degree>4) or (atoms->i->>'element'='H' and degree<>1) then return null; end if;
 end loop;
 return jsonb_build_object('atoms',atoms,'bonds',bonds,'lonePairs','[]'::jsonb);
exception when others then return null;
end $$;

create or replace function public.mono_graph_matches(p_student jsonb,p_model jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare a jsonb:=public.mono_normalize_graph(p_student);b jsonb:=public.mono_normalize_graph(p_model);
begin
 if a is null or b is null then return false; end if;
 return public.bonus_graph_matches(a,b);
end $$;

-- Voorbereiding van een eigen vragenbank voor Alkanenarchitect.
create table if not exists public.alkane_custom_questions (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 model jsonb not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.alkane_custom_questions enable row level security;
drop policy if exists alkane_custom_teacher on public.alkane_custom_questions;
create policy alkane_custom_teacher on public.alkane_custom_questions for all to authenticated
 using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'))
 with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
grant select,insert,update,delete on public.alkane_custom_questions to authenticated;

create or replace function public.start_mono_game(p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ids uuid[]; s public.mono_sessions%rowtype; items jsonb; timed boolean;
begin
 if auth.uid() is null then raise exception 'Log eerst in.'; end if;
 if p_mode not in ('group','name','draw','alkane') then raise exception 'Ongeldige spelvorm.'; end if;
 timed:=p_mode='group';
 if p_mode='alkane' then
  select array_agg(id order by random()) into ids from public.alkane_custom_questions where is_active;
 else
  select array_agg(id order by random()) into ids from public.mono_questions where is_active;
 end if;
 if coalesce(cardinality(ids),0)<(case when timed then 1 else 5 end) then raise exception 'Er zijn onvoldoende actieve opgaven (minimaal 5 voor Benoem en Teken).'; end if;
 if not timed then ids:=ids[1:5]; end if;
 insert into public.mono_sessions(user_id,mode,question_ids,expires_at) values(auth.uid(),p_mode,ids,case when timed then now()+interval '60 seconds' end) returning * into s;
 if p_mode='alkane' then
  select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by x.ord) into items
  from unnest(ids) with ordinality x(id,ord) join public.alkane_custom_questions q on q.id=x.id;
 else
  select jsonb_agg(jsonb_build_object('id',q.id,'name',case when p_mode='draw' then q.name else null end,'model',case when p_mode<>'draw' then q.model else null end) order by x.ord)
  into items from unnest(ids) with ordinality x(id,ord) join public.mono_questions q on q.id=x.id;
 end if;
 return jsonb_build_object('session_id',s.id,'items',coalesce(items,'[]'::jsonb),'expires_at',s.expires_at);
end $$;

create or replace function public.submit_mono_answer(p_session_id uuid,p_sequence integer,p_answer text default '',p_structure jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.mono_sessions%rowtype; q public.mono_questions%rowtype; aq public.alkane_custom_questions%rowtype; qid uuid; ok boolean:=false; reward integer:=0; balance integer;
begin
 select * into s from public.mono_sessions where id=p_session_id and user_id=auth.uid() for update;
 if not found or s.finished_at is not null then raise exception 'Spelronde is niet actief.'; end if;
 if s.expires_at is not null and now()>s.expires_at then raise exception 'De tijd is om.'; end if;
 if p_sequence<>s.answered+1 or p_sequence<1 or (s.expires_at is null and p_sequence>cardinality(s.question_ids)) then raise exception 'Ongeldige vraagvolgorde.'; end if;
 qid:=s.question_ids[((p_sequence-1)%cardinality(s.question_ids))+1];
 if s.mode='alkane' then
  select * into aq from public.alkane_custom_questions where id=qid;
  ok:=public.mono_graph_matches(p_structure,aq.model);
 else
  select * into q from public.mono_questions where id=qid;
 end if;
 if s.mode='group' then ok:=lower(trim(p_answer))=q.category;
 elsif s.mode='name' then ok:=lower(trim(p_answer)) in (lower(trim(q.name)),lower(trim(q.alternative_name))) and trim(p_answer)<>'';
 elsif s.mode='draw' then ok:=public.mono_graph_matches(p_structure,q.model); end if;
 if ok then
  if s.mode='group' then reward:=floor(s.correct::numeric/5)::integer+1;
  else reward:=least(s.correct+1,5); end if;
 end if;
 update public.mono_sessions set answered=answered+1,correct=correct+case when ok then 1 else 0 end,coins_earned=coins_earned+reward,
 finished_at=case when expires_at is null and p_sequence=cardinality(question_ids) then now() else finished_at end where id=s.id;
 update public.profiles set coins=coins+reward,xp=xp+case when ok then 2 else 0 end where id=auth.uid() returning coins into balance;
 return jsonb_build_object('correct',ok,'reward',reward,'coins',balance,'correct_count',s.correct+case when ok then 1 else 0 end,
 'expected',case when s.mode='alkane' then aq.name when s.mode='group' then q.category else q.name end);
end $$;

create or replace function public.finish_mono_game(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.mono_sessions%rowtype;
begin
 select * into s from public.mono_sessions where id=p_session_id and user_id=auth.uid() for update;
 if not found then raise exception 'Spelronde niet gevonden.'; end if;
 update public.mono_sessions set finished_at=coalesce(finished_at,now()) where id=s.id;
 return jsonb_build_object('correct',s.correct,'coins',s.coins_earned);
end $$;
revoke all on function public.start_mono_game(text),public.submit_mono_answer(uuid,integer,text,jsonb),public.finish_mono_game(uuid) from public,anon;
grant execute on function public.start_mono_game(text),public.submit_mono_answer(uuid,integer,text,jsonb),public.finish_mono_game(uuid) to authenticated;

