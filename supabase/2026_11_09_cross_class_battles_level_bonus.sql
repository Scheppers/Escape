-- Chemie Escape Room | battles tussen klassen + levelhandicap
-- Voer dit eenmalig uit NA 2026_11_chemiekaarten_reacties_battles_fixed.sql.
-- Deze migratie verwijdert geen bestaande battles of leerlinggegevens.
-- Level = floor(XP/100)+1; voordeel wordt vastgelegd bij aanvaarden.

begin;

alter table public.battles add column if not exists challenger_start_hp integer;
alter table public.battles add column if not exists opponent_start_hp integer;
update public.battles set challenger_start_hp=coalesce(challenger_start_hp,starting_hp),
                          opponent_start_hp=coalesce(opponent_start_hp,starting_hp)
where challenger_start_hp is null or opponent_start_hp is null;
alter table public.battles alter column challenger_start_hp set not null;
alter table public.battles alter column opponent_start_hp set not null;

-- Deelnemers mogen hun eigen battles bekijken, ongeacht de klas.
create or replace function public.is_battle_participant(p_battle_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.battles b
               where b.id=p_battle_id and auth.uid() in (b.challenger_id,b.opponent_id));
$$;
revoke all on function public.is_battle_participant(uuid) from public,anon;
grant execute on function public.is_battle_participant(uuid) to authenticated;

drop policy if exists battles_participant_read on public.battles;
create policy battles_participant_read on public.battles for select to authenticated
using (public.is_battle_participant(id));
drop policy if exists battle_moves_participant_read on public.battle_moves;
create policy battle_moves_participant_read on public.battle_moves for select to authenticated
using (public.is_battle_participant(battle_id));
drop policy if exists battle_decks_owner_read on public.battle_decks;
create policy battle_decks_owner_read on public.battle_decks for select to authenticated
using (user_id=(select auth.uid()) and public.is_battle_participant(battle_id));

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
 insert into public.battles(challenger_id,opponent_id,status,current_turn,starting_hp,challenger_hp,opponent_hp,turn_role,round_count,turn_count)
 values(v_uid,v_opponent,'pending',v_uid,v_hp,v_hp,v_hp,'attacker',0,0) returning id into v_battle;
 insert into public.battle_decks(battle_id,user_id,slot_number,card_id)
 select v_battle,v_uid,ord::integer,card_id from unnest(p_deck_card_ids) with ordinality as t(card_id,ord);
 return jsonb_build_object('ok',true,'battle_id',v_battle,'opponent_id',v_opponent);
end; $$;

create or replace function public.respond_to_battle(p_battle_id uuid,p_accept boolean,p_deck_card_ids text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_b public.battles%rowtype; v_item record; v_qty integer;
 v_challenger_level integer; v_opponent_level integer; v_bonus integer:=0;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_b from public.battles where id=p_battle_id for update;
 if not found then raise exception 'Uitdaging niet gevonden.'; end if;
 if not public.is_battle_participant(v_b.id) then raise exception 'Je neemt niet deel aan deze battle.'; end if;
 if v_b.opponent_id<>v_uid then raise exception 'Alleen de uitgedaagde speler kan antwoorden.'; end if;
 if v_b.status<>'pending' then raise exception 'Deze uitdaging is niet meer open.'; end if;
 if not p_accept then
   update public.battles set status='declined',current_turn=null,updated_at=now() where id=v_b.id;
   return jsonb_build_object('ok',true,'status','declined','battle_id',v_b.id);
 end if;
 if coalesce(array_length(p_deck_card_ids,1),0)<>5 then raise exception 'Selecteer precies vijf kaarten voor je battledeck.'; end if;
 perform 1 from public.profiles where id=v_uid for update;
 for v_item in select card_id,count(*)::integer as qty from unnest(p_deck_card_ids) as t(card_id) group by card_id loop
   select quantity into v_qty from public.user_cards where user_id=v_uid and card_id=v_item.card_id for update;
   if coalesce(v_qty,0)<v_item.qty then raise exception 'Je bezit onvoldoende exemplaren van % voor je deck.',v_item.card_id; end if;
 end loop;
 -- Lock beide profielen om de levels op het aanvaardmoment vast te leggen.
 perform 1 from public.profiles where id in (v_b.challenger_id,v_b.opponent_id) order by id for update;
 select greatest(1,(xp / 100)+1) into v_challenger_level from public.profiles where id=v_b.challenger_id;
 select greatest(1,(xp / 100)+1) into v_opponent_level from public.profiles where id=v_b.opponent_id;
 v_bonus:=case when abs(v_challenger_level-v_opponent_level)>=6 then 2
               when abs(v_challenger_level-v_opponent_level)>=3 then 1 else 0 end;
 insert into public.battle_decks(battle_id,user_id,slot_number,card_id)
 select v_b.id,v_uid,ord::integer,card_id from unnest(p_deck_card_ids) with ordinality as t(card_id,ord);
 update public.battles set status='active',current_turn=challenger_id,turn_role='attacker',round_count=0,turn_count=0,
   challenger_hp=starting_hp + case when v_challenger_level<v_opponent_level then v_bonus else 0 end,
   opponent_hp=starting_hp + case when v_opponent_level<v_challenger_level then v_bonus else 0 end,
   challenger_start_hp=starting_hp + case when v_challenger_level<v_opponent_level then v_bonus else 0 end,
   opponent_start_hp=starting_hp + case when v_opponent_level<v_challenger_level then v_bonus else 0 end,
   pending_attack_user_id=null,pending_attack_card_id=null,pending_attack_slot=null,pending_attack_move_number=null,updated_at=now()
 where id=v_b.id;
 return jsonb_build_object('ok',true,'status','active','battle_id',v_b.id,'current_turn',v_b.challenger_id,'current_role','attacker');
end; $$;

create or replace function public.play_battle_card(p_battle_id uuid,p_deck_slot integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_uid uuid:=auth.uid(); v_b public.battles%rowtype; v_card public.card_catalog%rowtype; v_attack public.card_catalog%rowtype;
 v_other uuid; v_move_no integer; v_round integer; v_att_power integer; v_def_power integer; v_damage integer:=0;
 v_chp integer; v_ohp integer; v_damage_to uuid; v_cancel boolean:=false; v_note text:=''; v_status text; v_winner uuid;
 v_xp_winner integer:=0; v_xp_loser integer:=0; v_reward_id text; v_reward_name text; v_reward_formula text;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_b from public.battles where id=p_battle_id for update;
 if not found then raise exception 'Battle niet gevonden.'; end if;
 if not public.is_battle_participant(v_b.id) then raise exception 'Je neemt niet deel aan deze battle.'; end if;
 if v_b.status<>'active' then raise exception 'Deze battle is niet actief.'; end if;
 if v_b.current_turn<>v_uid then raise exception 'Het is nog niet jouw beurt.'; end if;
 if p_deck_slot not between 1 and 5 then raise exception 'Ongeldige kaartpositie.'; end if;
 select c.* into v_card from public.battle_decks d join public.card_catalog c on c.id=d.card_id
 where d.battle_id=v_b.id and d.user_id=v_uid and d.slot_number=p_deck_slot;
 if not found then raise exception 'Deze kaart zit niet in jouw geselecteerde battledeck.'; end if;
 if exists(select 1 from public.battle_moves where battle_id=v_b.id and user_id=v_uid and deck_slot=p_deck_slot) then raise exception 'Deze kaart heb je al gespeeld.'; end if;
 v_move_no:=v_b.turn_count+1; v_round:=v_b.round_count+1;
 if v_b.turn_role='attacker' then
   if v_b.pending_attack_user_id is not null then raise exception 'Er staat al een aanval klaar om te verdedigen.'; end if;
   v_other:=case when v_uid=v_b.challenger_id then v_b.opponent_id else v_b.challenger_id end;
   insert into public.battle_moves(battle_id,move_number,user_id,card_id,damage,hp_after,deck_slot,round_number,role,effective_power,support_note)
   values(v_b.id,v_move_no,v_uid,v_card.id,0,case when v_uid=v_b.challenger_id then v_b.challenger_hp else v_b.opponent_hp end,p_deck_slot,v_round,'attacker',v_card.power,'');
   update public.battles set turn_count=v_move_no,current_turn=v_other,turn_role='defender',pending_attack_user_id=v_uid,pending_attack_card_id=v_card.id,pending_attack_slot=p_deck_slot,pending_attack_move_number=v_move_no,updated_at=now()
   where id=v_b.id;
   return jsonb_build_object('ok',true,'status','active','phase','attack_selected','current_turn',v_other,'current_role','defender','round_count',v_round,'attacker_card',v_card.formula);
 end if;
 if v_b.turn_role<>'defender' or v_b.pending_attack_user_id is null then raise exception 'Er is geen aanval om te verdedigen.'; end if;
 if v_uid=v_b.pending_attack_user_id then raise exception 'Je kunt je eigen aanval niet verdedigen.'; end if;
 select * into v_attack from public.card_catalog where id=v_b.pending_attack_card_id;
 v_att_power:=v_attack.power; v_def_power:=v_card.power;
 -- Ondersteuning wordt symmetrisch toegepast: het maakt niet uit wie aanvalt of verdedigt.
 if v_attack.support_target_type=v_card.card_type and v_attack.support_effect='halve' then
   v_def_power:=floor(v_def_power/2.0)::integer;
   v_note:=concat_ws(' ',v_note,coalesce(nullif(v_attack.support_description,''),v_attack.name||' halveert de kracht.'));
 elsif v_attack.support_target_type=v_card.card_type and v_attack.support_effect='cancel_damage' then
   v_cancel:=true; v_note:=concat_ws(' ',v_note,coalesce(nullif(v_attack.support_description,''),v_attack.name||' voorkomt schade.'));
 end if;
 if v_card.support_target_type=v_attack.card_type and v_card.support_effect='halve' then
   v_att_power:=floor(v_att_power/2.0)::integer;
   v_note:=concat_ws(' ',v_note,coalesce(nullif(v_card.support_description,''),v_card.name||' halveert de kracht.'));
 elsif v_card.support_target_type=v_attack.card_type and v_card.support_effect='cancel_damage' then
   v_cancel:=true; v_note:=concat_ws(' ',v_note,coalesce(nullif(v_card.support_description,''),v_card.name||' voorkomt schade.'));
 end if;
 v_chp:=v_b.challenger_hp; v_ohp:=v_b.opponent_hp; v_damage_to:=null;
 if not v_cancel then
   if v_att_power>v_def_power then v_damage:=v_att_power-v_def_power; v_damage_to:=v_uid; -- attacker is opponent of defender
   elsif v_def_power>v_att_power then v_damage:=v_def_power-v_att_power; v_damage_to:=v_b.pending_attack_user_id;
   else v_damage:=0;
   end if;
   if v_damage_to=v_b.challenger_id then v_chp:=greatest(0,v_chp-v_damage);
   elsif v_damage_to=v_b.opponent_id then v_ohp:=greatest(0,v_ohp-v_damage); end if;
 else
   v_damage:=0;
 end if;
 update public.battle_moves set effective_power=v_att_power,damage=v_damage,
   hp_after=case when v_damage_to=v_b.challenger_id then v_chp when v_damage_to=v_b.opponent_id then v_ohp else case when user_id=v_b.challenger_id then v_chp else v_ohp end end,
   support_note=v_note,damage_to_user_id=v_damage_to
 where battle_id=v_b.id and move_number=v_b.pending_attack_move_number;
 insert into public.battle_moves(battle_id,move_number,user_id,card_id,damage,hp_after,deck_slot,round_number,role,effective_power,support_note,damage_to_user_id)
 values(v_b.id,v_move_no,v_uid,v_card.id,v_damage,case when v_uid=v_b.challenger_id then v_chp else v_ohp end,p_deck_slot,v_round,'defender',v_def_power,v_note,v_damage_to);
 v_winner:=null; v_status:='active';
 if v_chp=0 or v_ohp=0 or v_round>=5 then
   v_status:='completed';
   if v_chp>v_ohp then v_winner:=v_b.challenger_id; elsif v_ohp>v_chp then v_winner:=v_b.opponent_id; end if;
 end if;
 update public.battles set challenger_hp=v_chp,opponent_hp=v_ohp,round_count=v_round,turn_count=v_move_no,
   current_turn=case when v_status='active' then v_uid else null end,
   turn_role='attacker',pending_attack_user_id=null,pending_attack_card_id=null,pending_attack_slot=null,pending_attack_move_number=null,
   status=v_status,winner_id=v_winner,updated_at=now()
 where id=v_b.id;
 if v_status='completed' then
   if v_winner is null then
     update public.profiles set xp=xp+25 where id in (v_b.challenger_id,v_b.opponent_id);
   else
     update public.profiles set xp=xp+case when id=v_winner then 50 else 15 end where id in (v_b.challenger_id,v_b.opponent_id);
     select id,name,formula into v_reward_id,v_reward_name,v_reward_formula from public.card_catalog where is_reward_only=true order by random() limit 1;
     if v_reward_id is not null then
       update public.battles set reward_card_id=v_reward_id where id=v_b.id;
       insert into public.user_cards(user_id,card_id,quantity) values(v_winner,v_reward_id,1)
       on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+1;
     end if;
   end if;
 end if;
 return jsonb_build_object('ok',true,'status',v_status,'phase','round_resolved','round_count',v_round,'turn_count',v_move_no,
   'attacker_power',v_att_power,'defender_power',v_def_power,'damage',v_damage,'damage_to_user_id',v_damage_to,'support_note',v_note,
   'challenger_hp',v_chp,'opponent_hp',v_ohp,'winner_id',v_winner,'current_turn',case when v_status='active' then v_uid else null end,
   'current_role',case when v_status='active' then 'attacker' else null end,'reward_card_id',v_reward_id,'reward_card_name',v_reward_name,'reward_card_formula',v_reward_formula);
end; $$;

create or replace function public.get_my_battles()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'battle_id',b.id,'challenger_id',b.challenger_id,'opponent_id',b.opponent_id,
   'challenger_username',cp.username,'opponent_username',op.username,'status',b.status,
   'current_turn',b.current_turn,'current_role',b.turn_role,'turn_count',b.turn_count,'round_count',b.round_count,'starting_hp',b.starting_hp,
   'challenger_hp',b.challenger_hp,'opponent_hp',b.opponent_hp,
   'challenger_start_hp',b.challenger_start_hp,'opponent_start_hp',b.opponent_start_hp,'winner_id',b.winner_id,'reward_card_id',b.reward_card_id,
   'created_at',b.created_at,'updated_at',b.updated_at
 ) order by b.updated_at desc), '[]'::jsonb)
 into v_result
 from public.battles b
 join public.profiles cp on cp.id=b.challenger_id
 join public.profiles op on op.id=b.opponent_id
 where v_uid in (b.challenger_id,b.opponent_id)
   and cp.role='student' and op.role='student';
 return v_result;
end; $$;
-- Alleen ingelogde gebruikers mogen deze beveiligde RPCs aanroepen.
revoke all on function public.create_battle(text,text[]) from public,anon;
revoke all on function public.respond_to_battle(uuid,boolean,text[]) from public,anon;
revoke all on function public.play_battle_card(uuid,integer) from public,anon;
revoke all on function public.get_my_battles() from public,anon;
grant execute on function public.create_battle(text,text[]) to authenticated;
grant execute on function public.respond_to_battle(uuid,boolean,text[]) to authenticated;
grant execute on function public.play_battle_card(uuid,integer) to authenticated;
grant execute on function public.get_my_battles() to authenticated;
commit;
