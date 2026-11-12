-- Chemie Escape Room: publieke basispuzzels (zonder gebruikersaccount)
-- Voer dit script eenmaal uit in Supabase SQL Editor.
-- Dit wijzigt geen bestaande functies of leerlinggegevens.
create table if not exists public.guest_puzzle_sessions (
 id uuid primary key default gen_random_uuid(),
 level_id text not null,
 object_id text not null,
 question_ids text[] not null,
 submissions jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '2 hours'),
 completed_at timestamptz
);
create index if not exists guest_puzzle_sessions_expires_idx on public.guest_puzzle_sessions(expires_at);
alter table public.guest_puzzle_sessions enable row level security;
revoke all on public.guest_puzzle_sessions from public,anon,authenticated;

create or replace function public.start_guest_puzzle(p_level_id text,p_object_id text)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_ids text[];v_items jsonb;v_session uuid;v_required integer:=3;
begin
 if p_level_id not in ('medieval','lavoisier','modern','future') or p_object_id not in ('object1','object2','object3','object4') then
  raise exception 'Ongeldige puzzelkeuze.';
 end if;
 select array_agg(question_id) into v_ids from (
  select question_id from public.quiz_questions
  where level_id=p_level_id and object_id=p_object_id and difficulty='basis' and is_active=true
  order by random() limit v_required
 ) s;
 if coalesce(cardinality(v_ids),0)<v_required then raise exception 'Er zijn nog niet voldoende actieve basisvragen voor deze puzzel.'; end if;
 insert into public.guest_puzzle_sessions(level_id,object_id,question_ids)
 values(p_level_id,p_object_id,v_ids) returning id into v_session;
 select jsonb_agg(jsonb_build_object('question_id',q.question_id,'question_type',q.question_type,
  'question_text',q.question_text,'options',q.options) order by x.ord)
 into v_items from unnest(v_ids) with ordinality x(question_id,ord)
 join public.quiz_questions q on q.question_id=x.question_id;
 return jsonb_build_object('ok',true,'session_id',v_session,'questions',v_items,'required_count',v_required);
end;$function$;

create or replace function public.submit_guest_puzzle_answer(p_session_id uuid,p_question_id text,p_answer text)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_s public.guest_puzzle_sessions%rowtype;v_q public.quiz_questions%rowtype;
 v_index integer;v_correct boolean;v_answer_text text;v_submissions jsonb;v_done boolean;
 v_review jsonb;v_score integer;
begin
 select * into v_s from public.guest_puzzle_sessions where id=p_session_id for update;
 if not found or v_s.expires_at<now() then raise exception 'Deze gastsessie is verlopen. Start een nieuwe sessie.';end if;
 if v_s.completed_at is not null then raise exception 'Deze gastsessie is al afgerond.';end if;
 v_index:=jsonb_array_length(v_s.submissions)+1;
 if v_index>cardinality(v_s.question_ids) or v_s.question_ids[v_index] is distinct from p_question_id then
  raise exception 'Deze vraag is al beantwoord of niet aan de beurt.';
 end if;
 select * into v_q from public.quiz_questions where question_id=p_question_id and level_id=v_s.level_id and object_id=v_s.object_id;
 if not found then raise exception 'De vraag bestaat niet meer.';end if;
 v_answer_text:=coalesce(p_answer,'');
 if v_q.question_type='short_answer' then
  v_correct:=lower(regexp_replace(btrim(v_answer_text),'[[:space:]]+',' ','g'))=
             lower(regexp_replace(btrim(coalesce(v_q.correct_answer_text,'')),'[[:space:]]+',' ','g'));
 else
  v_correct:=v_answer_text~'^-?[0-9]+$' and v_answer_text::numeric=v_q.correct_answer;
 end if;
 v_submissions:=v_s.submissions||jsonb_build_array(jsonb_build_object('question_id',p_question_id,'answer',v_answer_text,'correct',v_correct));
 v_done:=jsonb_array_length(v_submissions)=cardinality(v_s.question_ids);
 update public.guest_puzzle_sessions set submissions=v_submissions,completed_at=case when v_done then now() else null end where id=v_s.id;
 if not v_done then return jsonb_build_object('ok',true,'correct',v_correct,'completed',false,'answered_count',v_index,'required_count',cardinality(v_s.question_ids));end if;
 select count(*) into v_score from jsonb_array_elements(v_submissions) x where (x->>'correct')::boolean;
 select jsonb_agg(jsonb_build_object('question_id',q.question_id,'question_text',q.question_text,
  'question_type',q.question_type,'options',q.options,'submitted',s.value->>'answer',
  'correct', (s.value->>'correct')::boolean,
  'correct_answer',q.correct_answer,'correct_answer_text',q.correct_answer_text) order by s.ordinality)
 into v_review from jsonb_array_elements(v_submissions) with ordinality s(value,ordinality)
 join public.quiz_questions q on q.question_id=s.value->>'question_id';
 return jsonb_build_object('ok',true,'correct',v_correct,'completed',true,'score',v_score,
  'required_count',cardinality(v_s.question_ids),'review',v_review);
end;$function$;

revoke all on function public.start_guest_puzzle(text,text) from public;
revoke all on function public.submit_guest_puzzle_answer(uuid,text,text) from public;
grant execute on function public.start_guest_puzzle(text,text) to anon,authenticated;
grant execute on function public.submit_guest_puzzle_answer(uuid,text,text) to anon,authenticated;
-- Aanbevolen voor productie: rate limiting bij Netlify/edge en periodieke verwijdering van verlopen sessies.
