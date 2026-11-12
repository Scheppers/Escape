-- Alkanenarchitect v7: 10 eigen getekende alkanen, maximaal 55 LabCoins,
-- eenmalige palladiumkaart na 10/10. Uitvoeren NA de eerdere
-- 2026_11_10_monofunctionele_verbindingsklassen.sql migratie.
-- Deze migratie verwijdert geen bestaande opgaven of leerlinggegevens.
-- De database controleert antwoorden en kent beloningen server-side toe.
-- Correctie v7.1: CASE-expressie in IF-voorwaarde tussen haakjes.

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
 if coalesce(cardinality(ids),0)<(case when p_mode='alkane' then 10 when timed then 1 else 5 end) then raise exception 'Er zijn onvoldoende actieve opgaven: Alkanenarchitect vereist minstens 10 eigen alkanen; Benoem en Teken minstens 5.'; end if;
 if not timed then ids:=ids[1:case when p_mode='alkane' then 10 else 5 end]; end if;
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
declare s public.mono_sessions%rowtype; q public.mono_questions%rowtype; aq public.alkane_custom_questions%rowtype; qid uuid; ok boolean:=false; reward integer:=0; balance integer; awarded boolean:=false;
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
  elsif s.mode='alkane' then reward:=least(s.correct+1,10);
  else reward:=least(s.correct+1,5); end if;
 end if;
 update public.mono_sessions set answered=answered+1,correct=correct+case when ok then 1 else 0 end,coins_earned=coins_earned+reward,
 finished_at=case when expires_at is null and p_sequence=cardinality(question_ids) then now() else finished_at end where id=s.id;
 if s.mode='alkane' and p_sequence=10 and (s.correct + (case when ok then 1 else 0 end)) = 10 then
  insert into public.user_cards(user_id,card_id)
  select auth.uid(),'palladium' where exists(select 1 from public.card_catalog where id='palladium')
  on conflict (user_id,card_id) do nothing;
  get diagnostics balance = row_count;
  awarded := balance=1;
 end if;
 update public.profiles set coins=coins+reward,xp=xp+case when ok then 2 else 0 end where id=auth.uid() returning coins into balance;
 return jsonb_build_object('correct',ok,'reward',reward,'special_card_awarded',awarded,'coins',balance,'correct_count',(s.correct + (case when ok then 1 else 0 end)),
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
