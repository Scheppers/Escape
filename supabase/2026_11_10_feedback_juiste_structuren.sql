-- Feedback met door leerkracht goedgekeurde tekeningen (v8)
-- Voer deze migratie uit NA de bestaande bonusspellen-migraties en de
-- GECORRIGEERDE Alkanenarchitect-v7.1-migratie.
-- Alleen na een fout ingediend antwoord wordt het juiste model vrijgegeven.
-- De beveiligde servercontrole en de bestaande beloningsregels blijven behouden.

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
 'expected',case when s.mode='alkane' then aq.name when s.mode='group' then q.category else q.name end,
 'correct_structure',case when not ok and s.mode='alkane' then aq.model when not ok and s.mode='draw' then q.model else null end);
end $$;

create or replace function public.submit_bonus_game_answer(p_session_id uuid,p_sequence integer,p_answer text default '',p_structure jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.bonus_game_sessions%rowtype; v_item public.bonus_game_items%rowtype; v_id uuid; v_ok boolean:=false; v_reward integer:=0; v_coins integer; v_expected text; v_count integer; v_tantalum_awarded boolean:=false; v_tantalum_id text; v_total integer; v_done integer;
begin
 if v_uid is null then raise exception 'Log eerst in.'; end if;
 select * into v_s from public.bonus_game_sessions where id=p_session_id and user_id=v_uid for update;
 if not found or v_s.finished_at is not null then raise exception 'Deze spelronde is niet meer actief.'; end if;
 if v_s.expires_at is not null and now()>v_s.expires_at then raise exception 'De tijd is om.'; end if;
 if p_sequence<>v_s.answered_count+1 or p_sequence<1 or (v_s.expires_at is null and p_sequence>cardinality(v_s.item_ids)) then raise exception 'Ongeldige vraagvolgorde.'; end if;
 if v_s.expires_at is not null then v_id:=v_s.item_ids[((p_sequence-1)%cardinality(v_s.item_ids))+1]; else v_id:=v_s.item_ids[p_sequence]; end if;
 select * into v_item from public.bonus_game_items where id=v_id;
 if v_s.game_type='lewis' then
   v_ok:=public.bonus_graph_matches(coalesce(p_structure,'{}'::jsonb),v_item.model) or exists(select 1 from jsonb_array_elements(v_item.accepted_models) as accepted(model) where public.bonus_graph_matches(p_structure,accepted.model));
 else
   v_ok:=lower(regexp_replace(regexp_replace(trim(coalesce(p_answer,'')),'[→⇒=]|->','→','g'),'\s+',' ','g'))=lower(regexp_replace(regexp_replace(trim(v_item.answer),'[→⇒=]|->','→','g'),'\s+',' ','g'))
     or (v_s.game_type='naming' and exists(select 1 from jsonb_array_elements_text(v_item.accepted_answers) as accepted(value) where lower(trim(accepted.value))=lower(trim(coalesce(p_answer,'')))))
     or (v_s.game_type='classification' and lower(trim(coalesce(p_answer,'')))=lower(trim(v_item.category)));
 end if;
 if v_ok then
   if v_s.game_type='reaction' then v_reward:=least(v_s.correct_count+1,5);
   elsif v_s.game_type='lewis' then v_reward:=3*least(v_s.correct_count+1,5);
   elsif v_s.game_type='classification' then v_reward:=((v_s.correct_count)/10)+1;
   elsif v_s.game_type='naming' then v_reward:=((v_s.correct_count)/5)+1; end if;
 end if;
 -- Registratie is per unieke reactie, niet per sessie of vraagpositie.
 if v_ok and v_s.game_type='reaction' then
   insert into public.reaction_bonus_correct(user_id,item_id) values(v_uid,v_item.id) on conflict do nothing;
   select count(*) into v_total from public.bonus_game_items where game_type='reaction' and is_active;
   select count(*) into v_done from public.reaction_bonus_correct r join public.bonus_game_items i on i.id=r.item_id
     where r.user_id=v_uid and i.game_type='reaction' and i.is_active;
   if v_total>0 and v_done=v_total then
     -- Eén beloning per leerling; een gelijktijdige inzending kan niet dubbel belonen.
     insert into public.reaction_bonus_tantalum_awards(user_id) values(v_uid) on conflict do nothing;
     if found then
       select id into v_tantalum_id from public.card_catalog where formula='Ta' order by (id='tantalum') desc limit 1;
       if v_tantalum_id is null then raise exception 'De tantaalkaart ontbreekt in de kaartenbank.'; end if;
       insert into public.user_cards(user_id,card_id,quantity) values(v_uid,v_tantalum_id,1)
         on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+1;
       v_tantalum_awarded:=true;
     end if;
   end if;
 end if;
 update public.bonus_game_sessions set answered_count=answered_count+1,correct_count=correct_count+case when v_ok then 1 else 0 end,earned_coins=earned_coins+v_reward,
 finished_at=case when (expires_at is null and p_sequence=cardinality(item_ids)) or (expires_at is not null and now()>=expires_at) then now() else finished_at end where id=v_s.id;
 if v_reward>0 then update public.profiles set coins=coins+v_reward,xp=xp+2 where id=v_uid returning coins into v_coins; else select coins into v_coins from public.profiles where id=v_uid; end if;
 v_expected:=case when v_s.game_type='naming' then (select string_agg(value,', ') from jsonb_array_elements_text(v_item.accepted_answers)) when v_s.game_type='lewis' then 'De goedgekeurde Lewisstructuur' when v_s.game_type='classification' then v_item.category else coalesce(v_item.answer,v_item.category) end;
 return jsonb_build_object('ok',true,'correct',v_ok,'expected_answer',v_expected,'explanation',v_item.explanation,'reward',v_reward,'correct_count',v_s.correct_count+case when v_ok then 1 else 0 end,'answered_count',v_s.answered_count+1,'coins',v_coins,'tantalum_awarded',v_tantalum_awarded,
 'correct_structures',case when v_s.game_type='lewis' and not v_ok then (select coalesce(jsonb_agg(m), '[]'::jsonb) from (select v_item.model as m where jsonb_typeof(v_item.model)='object' and jsonb_array_length(coalesce(v_item.model->'atoms','[]'::jsonb))>0 union all select value as m from jsonb_array_elements(coalesce(v_item.accepted_models,'[]'::jsonb)) where jsonb_typeof(value)='object') approved) else null end,
 'finished',(v_s.expires_at is null and p_sequence=cardinality(v_s.item_ids)) or (v_s.expires_at is not null and now()>=v_s.expires_at));
end $$;

revoke all on function public.submit_mono_answer(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.submit_mono_answer(uuid,integer,text,jsonb) to authenticated;
revoke all on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) to authenticated;
