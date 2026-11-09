-- Voer dit bestand EENMAAL uit in de Supabase SQL Editor van een bestaande installatie.
-- Beloning voor Reactiebalancer en Lewisstructuren volgt het aantal juiste antwoorden,
-- niet het vraagnummer. Bestaande vragen en leerlinggegevens blijven behouden.

create or replace function public.submit_bonus_game_answer(p_session_id uuid,p_sequence integer,p_answer text default '',p_structure jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.bonus_game_sessions%rowtype; v_item public.bonus_game_items%rowtype; v_id uuid; v_ok boolean:=false; v_reward integer:=0; v_coins integer; v_expected text; v_count integer;
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
 update public.bonus_game_sessions set answered_count=answered_count+1,correct_count=correct_count+case when v_ok then 1 else 0 end,earned_coins=earned_coins+v_reward,
 finished_at=case when (expires_at is null and p_sequence=cardinality(item_ids)) or (expires_at is not null and now()>=expires_at) then now() else finished_at end where id=v_s.id;
 if v_reward>0 then update public.profiles set coins=coins+v_reward,xp=xp+2 where id=v_uid returning coins into v_coins; else select coins into v_coins from public.profiles where id=v_uid; end if;
 v_expected:=case when v_s.game_type='naming' then (select string_agg(value,', ') from jsonb_array_elements_text(v_item.accepted_answers)) when v_s.game_type='lewis' then 'De goedgekeurde Lewisstructuur' when v_s.game_type='classification' then v_item.category else coalesce(v_item.answer,v_item.category) end;
 return jsonb_build_object('ok',true,'correct',v_ok,'expected_answer',v_expected,'explanation',v_item.explanation,'reward',v_reward,'correct_count',v_s.correct_count+case when v_ok then 1 else 0 end,'answered_count',v_s.answered_count+1,'coins',v_coins,'finished',(v_s.expires_at is null and p_sequence=cardinality(v_s.item_ids)) or (v_s.expires_at is not null and now()>=v_s.expires_at));
end $$;


revoke all on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) from public;
grant execute on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) to authenticated;
