-- HOTFIX: fout bij uitdagen: challenger_start_hp mag niet NULL zijn.
-- Uitvoeren na 2026_11_09_cross_class_battles_level_bonus.sql.
-- Bewaart alle bestaande battles, decks en leerlinggegevens.

begin;

create or replace function public.create_battle(p_opponent_username text,p_deck_card_ids text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_opponent uuid; v_opponent_class uuid; v_class uuid; v_role text; v_battle uuid; v_hp integer; v_item record; v_qty integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 if coalesce(array_length(p_deck_card_ids,1),0)<>5 then raise exception 'Selecteer precies vijf kaarten voor je battledeck.'; end if;
 select class_id,role into v_class,v_role from public.profiles where id=v_uid;
 if v_class is null or v_role<>'student' then raise exception 'Alleen leerlingen met een klasaccount kunnen battles starten.'; end if;
 select id,class_id into v_opponent,v_opponent_class from public.profiles where username=lower(trim(p_opponent_username)) and role='student';
 if not found then raise exception 'Geen leerling gevonden met die gebruikersnaam.'; end if;
 if v_opponent=v_uid then raise exception 'Je kunt jezelf niet uitdagen.'; end if;
 if exists(select 1 from public.battles where status in ('pending','active') and ((challenger_id=v_uid and opponent_id=v_opponent) or (challenger_id=v_opponent and opponent_id=v_uid))) then raise exception 'Er loopt al een uitdaging of battle met deze speler.'; end if;
 perform 1 from public.profiles where id=v_uid for update;
 for v_item in select card_id,count(*)::integer as qty from unnest(p_deck_card_ids) as t(card_id) group by card_id loop
   select quantity into v_qty from public.user_cards where user_id=v_uid and card_id=v_item.card_id for update;
   if coalesce(v_qty,0)<v_item.qty then raise exception 'Je bezit onvoldoende exemplaren van % voor je deck.',v_item.card_id; end if;
 end loop;
 select starting_hp into v_hp from public.battle_settings where singleton=true;
 v_hp:=coalesce(v_hp,20);
 insert into public.battles(challenger_id,opponent_id,status,current_turn,starting_hp,challenger_hp,opponent_hp,challenger_start_hp,opponent_start_hp,turn_role,round_count,turn_count)
 values(v_uid,v_opponent,'pending',v_uid,v_hp,v_hp,v_hp,v_hp,v_hp,'attacker',0,0) returning id into v_battle;
 insert into public.battle_decks(battle_id,user_id,slot_number,card_id)
 select v_battle,v_uid,ord::integer,card_id from unnest(p_deck_card_ids) with ordinality as t(card_id,ord);
 return jsonb_build_object('ok',true,'battle_id',v_battle,'opponent_id',v_opponent);
end; $$;


commit;
