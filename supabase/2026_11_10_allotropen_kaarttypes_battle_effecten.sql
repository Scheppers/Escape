-- Chemie Escape Room: 94 stoffen, allotropen, dynamische kaarttypes en ondersteuning
-- Uitvoeren na de bestaande kaart- en battle-migraties. Maak vooraf een back-up.
begin;
alter table public.card_catalog add column if not exists support_target_type_2 text;
alter table public.card_catalog add column if not exists support_effect_2 text not null default 'none';
alter table public.card_catalog add column if not exists support_description_2 text not null default '';
create table if not exists public.card_types(name text primary key check (length(name) between 1 and 40));
insert into public.card_types(name)
select distinct lower(trim(card_type)) from public.card_catalog where card_type is not null and trim(card_type)<>''
on conflict do nothing;
insert into public.card_types(name) values ('water'),('vuur'),('steen'),('metaal'),('gas'),('vloeistof'),('zout'),('edelgas'),('vaste stof') on conflict do nothing;
insert into public.card_types(name)
select distinct lower(trim(target)) from (
 select support_target_type as target from public.card_catalog
 union all select support_target_type_2 from public.card_catalog
) t where target is not null and trim(target)<>'' on conflict do nothing;
alter table public.card_types enable row level security;
drop policy if exists card_types_read on public.card_types;
create policy card_types_read on public.card_types for select to authenticated using (true);
revoke all on public.card_types from public,anon;
grant select on public.card_types to authenticated;

create or replace function public.teacher_add_card_type(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_name text:=lower(trim(coalesce(p_name,'')));
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'Alleen leerkrachten kunnen kaarttypes toevoegen.'; end if;
 if length(v_name) not between 1 and 40 or v_name !~ '^[[:alnum:] _-]+$' then raise exception 'Ongeldig kaarttype.'; end if;
 insert into public.card_types(name) values(v_name) on conflict do nothing;
 return jsonb_build_object('ok',true,'name',v_name);
end; $$;
revoke all on function public.teacher_add_card_type(text) from public,anon;
grant execute on function public.teacher_add_card_type(text) to authenticated;

-- Ozon bestond al; behoud eventuele door de leerkracht aangepaste kaartgegevens.
insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only)
values('ozone','Ozon','O₃','gas','Meesterkaart',0,5,5,'Glanzende allotroop van zuurstof. Exclusieve battlebeloning.','gas',5,false,true)
on conflict(id) do update set is_shop_item=false,is_reward_only=true;
-- Diamant is een zelfstandige koolstof-allotroopkaart met symbool C.
insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only)
values('diamond','Diamant','C','vaste stof','Meesterkaart',0,6,6,'Kristallijne allotroop van koolstof. Exclusieve glanzende battlebeloning.','vaste stof',6,false,true)
on conflict(id) do update set is_shop_item=false,is_reward_only=true;

create or replace function public.teacher_save_card(p_card jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_id text; v_name text; v_formula text; v_type text; v_power integer; v_price integer; v_rarity text; v_effect text; v_target text; v_effect2 text; v_target2 text; v_shop boolean; v_reward boolean;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='teacher') then raise exception 'Alleen de leerkracht kan kaarten beheren.'; end if;
 v_id:=lower(trim(coalesce(p_card->>'id',''))); v_name:=trim(coalesce(p_card->>'name','')); v_formula:=trim(coalesce(p_card->>'formula','')); v_type:=lower(trim(coalesce(p_card->>'card_type','')));
 v_power:=coalesce((p_card->>'power')::integer,1); v_price:=coalesce((p_card->>'price')::integer,0); v_rarity:=nullif(trim(coalesce(p_card->>'rarity','')),''); v_effect:=coalesce(nullif(p_card->>'support_effect',''),'none'); v_target:=nullif(lower(trim(coalesce(p_card->>'support_target_type',''))),'');
 v_effect2:=coalesce(nullif(p_card->>'support_effect_2',''),'none'); v_target2:=nullif(lower(trim(coalesce(p_card->>'support_target_type_2',''))),'');
 v_shop:=coalesce((p_card->>'is_shop_item')::boolean,false); v_reward:=coalesce((p_card->>'is_reward_only')::boolean,false);
 if v_id !~ '^[a-z0-9][a-z0-9-]{1,49}$' or v_name='' or v_formula='' or v_type='' then raise exception 'Vul een geldige kaartcode, naam, formule en type in.'; end if;
 if v_power not between 1 and 20 or v_price<0 then raise exception 'Kracht moet 1–20 zijn en de winkelprijs mag niet negatief zijn.'; end if;
 if exists(select 1 from public.battle_decks d join public.battles b on b.id=d.battle_id where d.card_id=v_id and b.status in ('pending','active')) then
   raise exception 'Deze kaart zit in een open battledeck. Pas de kaart aan nadat die battle is afgelopen.';
 end if;
 if v_effect not in ('none','halve','cancel_damage','minus_1','minus_2','minus_3','zero') then raise exception 'Onbekend ondersteuningseffect.'; end if;
 if v_effect2 not in ('none','halve','cancel_damage','minus_1','minus_2','minus_3','zero') then raise exception 'Onbekend tweede ondersteuningseffect.'; end if;
 if v_effect2<>'none' and v_target2 is null then raise exception 'Kies een doeltype voor ondersteuning 2.'; end if;
 if v_effect<>'none' and v_target is null then raise exception 'Kies een doeltype voor de speciale ondersteuning.'; end if;
 if v_id in ('ozone','diamond') then v_shop:=false;v_reward:=true;end if;
 if not exists(select 1 from public.card_types where name=v_type) then raise exception 'Onbekend kaarttype. Voeg het eerst toe via Nieuw type.'; end if;
 if v_target is not null and not exists(select 1 from public.card_types where name=v_target) then raise exception 'Onbekend doeltype 1.'; end if;
 if v_target2 is not null and not exists(select 1 from public.card_types where name=v_target2) then raise exception 'Onbekend doeltype 2.'; end if;
 if v_shop and v_reward then raise exception 'Een beloningskaart kan niet tegelijk in de winkel te koop zijn.'; end if;
 insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,support_target_type,support_effect,support_description,support_target_type_2,support_effect_2,support_description_2,is_shop_item,is_reward_only)
 values(v_id,v_name,v_formula,v_type,coalesce(v_rarity,'Gewoon'),v_price,v_power,v_power,coalesce(p_card->>'description',''),v_type,v_power,v_target,v_effect,coalesce(p_card->>'support_description',''),v_target2,v_effect2,coalesce(p_card->>'support_description_2',''),v_shop,v_reward)
 on conflict(id) do update set name=excluded.name,formula=excluded.formula,category=excluded.category,rarity=coalesce(v_rarity,public.card_catalog.rarity),price=excluded.price,attack=excluded.attack,shield=excluded.shield,description=excluded.description,card_type=excluded.card_type,power=excluded.power,support_target_type=excluded.support_target_type,support_effect=excluded.support_effect,support_description=excluded.support_description,support_target_type_2=excluded.support_target_type_2,support_effect_2=excluded.support_effect_2,support_description_2=excluded.support_description_2,is_shop_item=excluded.is_shop_item,is_reward_only=excluded.is_reward_only;
 return jsonb_build_object('ok',true,'card_id',v_id);
end; $$;

create or replace function public.play_battle_card(p_battle_id uuid,p_deck_slot integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_uid uuid:=auth.uid(); v_b public.battles%rowtype; v_card public.card_catalog%rowtype; v_attack public.card_catalog%rowtype;
 v_other uuid; v_move_no integer; v_round integer; v_att_power integer; v_def_power integer; v_damage integer:=0;
 v_chp integer; v_ohp integer; v_damage_to uuid; v_cancel boolean:=false; v_note text:=''; v_status text; v_winner uuid;
 v_support record;
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
 -- Beide ondersteuningseffecten worden symmetrisch en uitsluitend lokaal in dit duel toegepast.
 -- De opgeslagen kaartkracht wordt nooit aangepast.
 for v_support in
   select v_attack.support_target_type as target_type, v_attack.support_effect as effect, v_attack.support_description as description, v_attack.name as card_name, 'attack' as side
   union all select v_attack.support_target_type_2, v_attack.support_effect_2, v_attack.support_description_2, v_attack.name, 'attack'
   union all select v_card.support_target_type, v_card.support_effect, v_card.support_description, v_card.name, 'defend'
   union all select v_card.support_target_type_2, v_card.support_effect_2, v_card.support_description_2, v_card.name, 'defend'
 loop
   if v_support.target_type is null or v_support.target_type='' then continue; end if;
   if v_support.side='attack' and v_support.target_type=v_card.card_type then
     if v_support.effect='cancel_damage' then v_cancel:=true;
     elsif v_support.effect='zero' then v_def_power:=0;
     elsif v_support.effect='minus_1' then v_def_power:=greatest(0,v_def_power-1);
     elsif v_support.effect='minus_2' then v_def_power:=greatest(0,v_def_power-2);
     elsif v_support.effect='minus_3' then v_def_power:=greatest(0,v_def_power-3);
     elsif v_support.effect='halve' then v_def_power:=floor(v_def_power/2.0)::integer;
     else continue; end if;
   elsif v_support.side='defend' and v_support.target_type=v_attack.card_type then
     if v_support.effect='cancel_damage' then v_cancel:=true;
     elsif v_support.effect='zero' then v_att_power:=0;
     elsif v_support.effect='minus_1' then v_att_power:=greatest(0,v_att_power-1);
     elsif v_support.effect='minus_2' then v_att_power:=greatest(0,v_att_power-2);
     elsif v_support.effect='minus_3' then v_att_power:=greatest(0,v_att_power-3);
     elsif v_support.effect='halve' then v_att_power:=floor(v_att_power/2.0)::integer;
     else continue; end if;
   else continue; end if;
   v_note:=concat_ws(' ',v_note,coalesce(nullif(v_support.description,''),v_support.card_name||' gebruikt ondersteuning ('||v_support.effect||').'));
 end loop;
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
revoke all on function public.teacher_save_card(jsonb) from public,anon;
grant execute on function public.teacher_save_card(jsonb) to authenticated;
revoke all on function public.play_battle_card(uuid,integer) from public,anon;
grant execute on function public.play_battle_card(uuid,integer) to authenticated;
commit;
