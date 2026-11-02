-- Chemie Escape Room: stoffenkaarten, reactiekamer en beurtgebaseerde battles.
-- Voer deze migratie precies één keer uit na het bestaande schema en de eerdere migraties.
-- Bestaande gebruikers, munten, skins en kaartbezit blijven behouden.

alter table public.card_catalog add column if not exists card_type text not null default 'vaste stof';
alter table public.card_catalog add column if not exists power integer not null default 1 check (power between 1 and 20);
alter table public.card_catalog add column if not exists support_target_type text;
alter table public.card_catalog add column if not exists support_effect text not null default 'none';
alter table public.card_catalog add column if not exists support_description text not null default '';
alter table public.card_catalog add column if not exists is_shop_item boolean not null default false;
alter table public.card_catalog add column if not exists is_reward_only boolean not null default false;

-- Aantal exemplaren per speler; de bestaande sleutel (user_id, card_id) blijft bruikbaar.
alter table public.user_cards add column if not exists quantity integer not null default 1;
alter table public.user_cards drop constraint if exists user_cards_quantity_check;
alter table public.user_cards add constraint user_cards_quantity_check check (quantity >= 1);

create table if not exists public.card_reactions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reactant_a_id text not null references public.card_catalog(id),
  reactant_a_qty integer not null check (reactant_a_qty between 1 and 99),
  reactant_b_id text not null references public.card_catalog(id),
  reactant_b_qty integer not null check (reactant_b_qty between 1 and 99),
  product_a_id text not null references public.card_catalog(id),
  product_a_qty integer not null check (product_a_qty between 1 and 99),
  product_b_id text references public.card_catalog(id),
  product_b_qty integer not null default 0 check (product_b_qty between 0 and 99),
  equation_text text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reactant_a_id <> reactant_b_id),
  check ((product_b_id is null and product_b_qty = 0) or (product_b_id is not null and product_b_qty > 0))
);
create index if not exists card_reactions_active_idx on public.card_reactions(active);

create table if not exists public.battle_settings (
  singleton boolean primary key default true check (singleton),
  starting_hp integer not null default 20 check (starting_hp between 1 and 200),
  updated_at timestamptz not null default now()
);
insert into public.battle_settings(singleton,starting_hp) values(true,20)
on conflict(singleton) do nothing;

alter table public.battles add column if not exists starting_hp integer not null default 20;
alter table public.battles add column if not exists turn_role text not null default 'attacker';
alter table public.battles add column if not exists round_count integer not null default 0;
alter table public.battles add column if not exists pending_attack_user_id uuid references public.profiles(id) on delete set null;
alter table public.battles add column if not exists pending_attack_card_id text references public.card_catalog(id);
alter table public.battles add column if not exists pending_attack_slot integer;
alter table public.battles add column if not exists pending_attack_move_number integer;
alter table public.battles add column if not exists reward_card_id text references public.card_catalog(id);

create table if not exists public.battle_decks (
  battle_id uuid not null references public.battles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 5),
  card_id text not null references public.card_catalog(id),
  created_at timestamptz not null default now(),
  primary key(battle_id,user_id,slot_number)
);

alter table public.battle_moves add column if not exists deck_slot integer;
alter table public.battle_moves add column if not exists round_number integer;
alter table public.battle_moves add column if not exists role text not null default 'attacker';
alter table public.battle_moves add column if not exists effective_power integer not null default 0;
alter table public.battle_moves add column if not exists support_note text not null default '';
alter table public.battle_moves add column if not exists damage_to_user_id uuid references public.profiles(id) on delete set null;
alter table public.battle_moves drop constraint if exists battle_moves_battle_id_user_id_card_id_key;
alter table public.battle_moves drop constraint if exists battle_moves_battle_id_user_id_deck_slot_key;
alter table public.battle_moves drop constraint if exists battle_moves_battle_user_slot_key;
alter table public.battle_moves add constraint battle_moves_battle_user_slot_key unique(battle_id,user_id,deck_slot);

-- Oude MVP-gevechten gebruikten een andere beurt- en kaartlogica. Sluit alleen eventueel
-- nog openstaande oude gevechten af; afgeronde historiek blijft bestaan.
update public.battles set status='declined',current_turn=null,updated_at=now()
where status in ('pending','active');

-- Bestaande kaarten worden omgezet naar één krachtwaarde en een chemisch kaarttype.
update public.card_catalog set power=greatest(1,least(20,attack)), is_shop_item=false, is_reward_only=false;
update public.card_catalog set formula='H₂',name='Waterstof',card_type='gas',power=1,attack=1,shield=1,price=5,rarity='Gewoon',description='Een lichte enkelvoudige stof in moleculaire vorm.',is_shop_item=true where id='hydrogen';
update public.card_catalog set formula='He',name='Helium',card_type='gas',power=1,attack=1,shield=1,price=8,rarity='Gewoon',description='Edelgas. Ondersteuning: neutraliseert schade wanneer het tegenover een gaskaart staat.',support_target_type='gas',support_effect='cancel_damage',support_description='Neutraliseert gaskaarten: in dit duel verliest niemand levenspunten.',is_shop_item=true where id='helium';
update public.card_catalog set formula='C',name='Koolstof',card_type='steen',power=2,attack=2,shield=2,price=5,rarity='Gewoon',description='Een veelzijdige vaste enkelvoudige stof.',is_shop_item=true where id='carbon';
update public.card_catalog set formula='O₂',name='Zuurstof',card_type='gas',power=2,attack=2,shield=2,price=5,rarity='Gewoon',description='Een reactieve enkelvoudige stof in moleculaire vorm.',is_shop_item=true where id='oxygen';
update public.card_catalog set formula='Fe',name='IJzer',card_type='metaal',power=3,attack=3,shield=3,price=10,rarity='Gewoon',description='Een stevige metaalkaart.',is_shop_item=true where id='iron';
update public.card_catalog set formula='Na',name='Natrium',card_type='metaal',power=2,attack=2,shield=2,price=8,rarity='Gewoon',description='Een reactief alkalimetaal.',is_shop_item=true where id='sodium';
update public.card_catalog set formula='Cl₂',name='Chloor',card_type='gas',power=3,attack=3,shield=3,price=8,rarity='Gewoon',description='Een halogeen in moleculaire vorm.',is_shop_item=true where id='chlorine';
update public.card_catalog set formula='S',name='Zwavel',card_type='steen',power=2,attack=2,shield=2,price=8,rarity='Gewoon',description='Een vaste enkelvoudige stof.',is_shop_item=true where id='sulfur';
update public.card_catalog set formula='Ag',name='Zilver',card_type='metaal',power=4,attack=4,shield=4,price=18,rarity='Zeldzaam',description='Een sterk edelmetaal.',is_shop_item=true where id='silver';
update public.card_catalog set formula='Au',name='Goud',card_type='metaal',power=5,attack=5,shield=5,price=22,rarity='Episch',description='Een krachtige edelmetaalkaart.',is_shop_item=true where id='gold';
update public.card_catalog set formula='Cu',name='Koper',card_type='metaal',power=3,attack=3,shield=3,price=12,rarity='Gewoon',description='Een goede middenmoter.',is_shop_item=true where id='copper';
update public.card_catalog set formula='H₂O',name='Water',card_type='water',power=2,attack=2,shield=2,price=15,rarity='Gewoon',description='Ondersteuning: halveert de kracht van een kaart van het type vuur.',support_target_type='vuur',support_effect='halve',support_description='Halveert de kracht van de tegenoverliggende vuurkaart.' where id='water';
update public.card_catalog set formula='CO₂',name='Koolstofdioxide',card_type='gas',power=2,attack=2,shield=2,is_shop_item=false where id='carbon-dioxide';
update public.card_catalog set formula='NH₃',name='Ammoniak',card_type='gas',power=3,attack=3,shield=3,is_shop_item=false where id='ammonia';
update public.card_catalog set formula='CaCO₃',name='Calciumcarbonaat',card_type='steen',power=3,attack=3,shield=3,is_shop_item=false where id='calcium-carbonate';
update public.card_catalog set formula='NaCl',name='Natriumchloride',card_type='zout',power=3,attack=3,shield=3,is_shop_item=false where id='sodium-chloride';
update public.card_catalog set formula='O₃',name='Ozonmeester',card_type='gas',power=5,attack=5,shield=5,rarity='Meesterkaart',description='Exclusieve beloningskaart voor een gewonnen chemiebattle.',is_shop_item=false,is_reward_only=true where id='ozone';
update public.card_catalog set formula='C₂H₆O',name='Ethanol',card_type='vloeistof',power=3,attack=3,shield=3,is_shop_item=false where id='ethanol';

insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only)
values
 ('nitrogen','Stikstof','N₂','Gas','Gewoon',6,1,1,'Een veelvoorkomende enkelvoudige stof.','gas',1,true,false),
 ('magnesium','Magnesium','Mg','Metaal','Gewoon',10,3,3,'Een reactief metaal.','metaal',3,true,false),
 ('bromine','Broom','Br₂','Halogeen','Zeldzaam',13,3,3,'Een halogeen in moleculaire vorm.','vloeistof',3,true,false)
on conflict(id) do update set name=excluded.name,formula=excluded.formula,category=excluded.category,rarity=excluded.rarity,price=excluded.price,attack=excluded.attack,shield=excluded.shield,description=excluded.description,card_type=excluded.card_type,power=excluded.power,is_shop_item=excluded.is_shop_item,is_reward_only=excluded.is_reward_only;

-- Eén startreactie als voorbeeld. De leerkracht kan nadien zelf reacties beheren.
insert into public.card_reactions(name,reactant_a_id,reactant_a_qty,reactant_b_id,reactant_b_qty,product_a_id,product_a_qty,equation_text,active)
select 'Vorming van water','hydrogen',2,'oxygen',1,'water',2,'2 H₂ + O₂ → 2 H₂O',true
where not exists(select 1 from public.card_reactions where name='Vorming van water');

-- Kaartenwinkel: meerdere exemplaren zijn toegestaan; alleen kaarten die de leerkracht
-- als winkelkaart heeft gemarkeerd, kunnen met LabCoins gekocht worden.
create or replace function public.buy_card(p_card_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_price integer; v_coins integer; v_quantity integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 if not exists(select 1 from public.profiles where id=v_uid and role='student' and class_id is not null) then raise exception 'Alleen leerlingen met een klasaccount kunnen kaarten kopen.'; end if;
 select price into v_price from public.card_catalog where id=p_card_id and is_shop_item=true and is_reward_only=false;
 if not found then raise exception 'Deze kaart is niet te koop in de winkel.'; end if;
 select coins into v_coins from public.profiles where id=v_uid for update;
 if v_coins < v_price then raise exception 'Je hebt niet genoeg LabCoins.'; end if;
 update public.profiles set coins=coins-v_price where id=v_uid returning coins into v_coins;
 insert into public.user_cards(user_id,card_id,quantity) values(v_uid,p_card_id,1)
 on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+1;
 select quantity into v_quantity from public.user_cards where user_id=v_uid and card_id=p_card_id;
 return jsonb_build_object('ok',true,'card_id',p_card_id,'quantity',v_quantity,'coins',v_coins);
end; $$;

create or replace function public.perform_card_reaction(p_reaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_r public.card_reactions%rowtype; v_have_a integer; v_have_b integer; v_coins integer; v_products jsonb;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 if not exists(select 1 from public.profiles where id=v_uid and role='student' and class_id is not null) then raise exception 'Alleen leerlingen met een klasaccount kunnen reacties uitvoeren.'; end if;
 select * into v_r from public.card_reactions where id=p_reaction_id and active=true;
 if not found then raise exception 'Deze reactie bestaat niet (meer).'; end if;
 perform 1 from public.profiles where id=v_uid for update;
 if exists(
   select 1 from public.battle_decks d join public.battles b on b.id=d.battle_id
   where d.user_id=v_uid and b.status in ('pending','active')
     and d.card_id in (v_r.reactant_a_id,v_r.reactant_b_id)
 ) then raise exception 'Een of meer beginstoffen zitten al vast in een open battledeck. Wacht tot die battle is afgelopen.'; end if;
 select quantity into v_have_a from public.user_cards where user_id=v_uid and card_id=v_r.reactant_a_id for update;
 if coalesce(v_have_a,0)<v_r.reactant_a_qty then raise exception 'Je hebt onvoldoende kaarten van de eerste beginstof.'; end if;
 select quantity into v_have_b from public.user_cards where user_id=v_uid and card_id=v_r.reactant_b_id for update;
 if coalesce(v_have_b,0)<v_r.reactant_b_qty then raise exception 'Je hebt onvoldoende kaarten van de tweede beginstof.'; end if;
 -- De kolom quantity heeft CHECK (quantity >= 1): verwijder de rij als de reactie
 -- exact alle exemplaren verbruikt, anders trek het vereiste aantal af.
 if v_have_a = v_r.reactant_a_qty then
   delete from public.user_cards where user_id=v_uid and card_id=v_r.reactant_a_id;
 else
   update public.user_cards set quantity=quantity-v_r.reactant_a_qty where user_id=v_uid and card_id=v_r.reactant_a_id;
 end if;
 if v_have_b = v_r.reactant_b_qty then
   delete from public.user_cards where user_id=v_uid and card_id=v_r.reactant_b_id;
 else
   update public.user_cards set quantity=quantity-v_r.reactant_b_qty where user_id=v_uid and card_id=v_r.reactant_b_id;
 end if;
 insert into public.user_cards(user_id,card_id,quantity) values(v_uid,v_r.product_a_id,v_r.product_a_qty)
 on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+excluded.quantity;
 if v_r.product_b_id is not null then
   insert into public.user_cards(user_id,card_id,quantity) values(v_uid,v_r.product_b_id,v_r.product_b_qty)
   on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+excluded.quantity;
 end if;
 select coins into v_coins from public.profiles where id=v_uid;
 select jsonb_agg(jsonb_build_object('card_id',c.id,'name',c.name,'formula',c.formula,'quantity',x.qty)) into v_products
 from (select v_r.product_a_id as id,v_r.product_a_qty as qty union all select v_r.product_b_id,v_r.product_b_qty where v_r.product_b_id is not null) x
 join public.card_catalog c on c.id=x.id;
 return jsonb_build_object('ok',true,'reaction_id',v_r.id,'equation',v_r.equation_text,'products',coalesce(v_products,'[]'::jsonb),'coins',v_coins);
end; $$;

drop function if exists public.create_battle(text);
create or replace function public.create_battle(p_opponent_username text,p_deck_card_ids text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_opponent uuid; v_opponent_class uuid; v_class uuid; v_role text; v_battle uuid; v_hp integer; v_item record; v_qty integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 if coalesce(array_length(p_deck_card_ids,1),0)<>5 then raise exception 'Selecteer precies vijf kaarten voor je battledeck.'; end if;
 select class_id,role into v_class,v_role from public.profiles where id=v_uid;
 if v_class is null or v_role<>'student' then raise exception 'Alleen leerlingen met een klasaccount kunnen battles starten.'; end if;
 select id,class_id into v_opponent,v_opponent_class from public.profiles where username=lower(trim(p_opponent_username)) and class_id=v_class and role='student';
 if not found then raise exception 'Geen klasgenoot gevonden met die gebruikersnaam.'; end if;
 if v_opponent=v_uid then raise exception 'Je kunt jezelf niet uitdagen.'; end if;
 if exists(select 1 from public.battles where status in ('pending','active') and ((challenger_id=v_uid and opponent_id=v_opponent) or (challenger_id=v_opponent and opponent_id=v_uid))) then raise exception 'Er loopt al een uitdaging of battle met deze klasgenoot.'; end if;
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

drop function if exists public.respond_to_battle(uuid,boolean);
create or replace function public.respond_to_battle(p_battle_id uuid,p_accept boolean,p_deck_card_ids text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_b public.battles%rowtype; v_item record; v_qty integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_b from public.battles where id=p_battle_id for update;
 if not found then raise exception 'Uitdaging niet gevonden.'; end if;
 if not public.is_battle_participant_same_class(v_b.id) then raise exception 'Deze battle is niet beschikbaar buiten je klas.'; end if;
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
 insert into public.battle_decks(battle_id,user_id,slot_number,card_id)
 select v_b.id,v_uid,ord::integer,card_id from unnest(p_deck_card_ids) with ordinality as t(card_id,ord);
 update public.battles set status='active',current_turn=challenger_id,turn_role='attacker',round_count=0,turn_count=0,
   challenger_hp=starting_hp,opponent_hp=starting_hp,pending_attack_user_id=null,pending_attack_card_id=null,pending_attack_slot=null,pending_attack_move_number=null,updated_at=now()
 where id=v_b.id;
 return jsonb_build_object('ok',true,'status','active','battle_id',v_b.id,'current_turn',v_b.challenger_id,'current_role','attacker');
end; $$;

drop function if exists public.play_battle_card(uuid,text);
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
 if not public.is_battle_participant_same_class(v_b.id) then raise exception 'Deze battle is niet beschikbaar buiten je klas.'; end if;
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
   'challenger_hp',b.challenger_hp,'opponent_hp',b.opponent_hp,'winner_id',b.winner_id,'reward_card_id',b.reward_card_id,
   'created_at',b.created_at,'updated_at',b.updated_at
 ) order by b.updated_at desc), '[]'::jsonb)
 into v_result
 from public.battles b
 join public.profiles cp on cp.id=b.challenger_id
 join public.profiles op on op.id=b.opponent_id
 join public.profiles me on me.id=v_uid
 where v_uid in (b.challenger_id,b.opponent_id)
   and cp.class_id=me.class_id and op.class_id=me.class_id
   and cp.role='student' and op.role='student';
 return v_result;
end; $$;

create or replace function public.teacher_save_card(p_card jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_id text; v_name text; v_formula text; v_type text; v_power integer; v_price integer; v_rarity text; v_effect text; v_target text; v_shop boolean; v_reward boolean;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='teacher') then raise exception 'Alleen de leerkracht kan kaarten beheren.'; end if;
 v_id:=lower(trim(coalesce(p_card->>'id',''))); v_name:=trim(coalesce(p_card->>'name','')); v_formula:=trim(coalesce(p_card->>'formula','')); v_type:=lower(trim(coalesce(p_card->>'card_type','')));
 v_power:=coalesce((p_card->>'power')::integer,1); v_price:=coalesce((p_card->>'price')::integer,0); v_rarity:=nullif(trim(coalesce(p_card->>'rarity','')),''); v_effect:=coalesce(nullif(p_card->>'support_effect',''),'none'); v_target:=nullif(lower(trim(coalesce(p_card->>'support_target_type',''))),'');
 v_shop:=coalesce((p_card->>'is_shop_item')::boolean,false); v_reward:=coalesce((p_card->>'is_reward_only')::boolean,false);
 if v_id !~ '^[a-z0-9][a-z0-9-]{1,49}$' or v_name='' or v_formula='' or v_type='' then raise exception 'Vul een geldige kaartcode, naam, formule en type in.'; end if;
 if v_power not between 1 and 20 or v_price<0 then raise exception 'Kracht moet 1–20 zijn en de winkelprijs mag niet negatief zijn.'; end if;
 if exists(select 1 from public.battle_decks d join public.battles b on b.id=d.battle_id where d.card_id=v_id and b.status in ('pending','active')) then
   raise exception 'Deze kaart zit in een open battledeck. Pas de kaart aan nadat die battle is afgelopen.';
 end if;
 if v_effect not in ('none','halve','cancel_damage') then raise exception 'Onbekend ondersteuningseffect.'; end if;
 if v_effect<>'none' and v_target is null then raise exception 'Kies een doeltype voor de speciale ondersteuning.'; end if;
 if v_shop and v_reward then raise exception 'Een beloningskaart kan niet tegelijk in de winkel te koop zijn.'; end if;
 insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,support_target_type,support_effect,support_description,is_shop_item,is_reward_only)
 values(v_id,v_name,v_formula,v_type,coalesce(v_rarity,'Gewoon'),v_price,v_power,v_power,coalesce(p_card->>'description',''),v_type,v_power,v_target,v_effect,coalesce(p_card->>'support_description',''),v_shop,v_reward)
 on conflict(id) do update set name=excluded.name,formula=excluded.formula,category=excluded.category,rarity=coalesce(v_rarity,public.card_catalog.rarity),price=excluded.price,attack=excluded.attack,shield=excluded.shield,description=excluded.description,card_type=excluded.card_type,power=excluded.power,support_target_type=excluded.support_target_type,support_effect=excluded.support_effect,support_description=excluded.support_description,is_shop_item=excluded.is_shop_item,is_reward_only=excluded.is_reward_only;
 return jsonb_build_object('ok',true,'card_id',v_id);
end; $$;

create or replace function public.teacher_save_reaction(p_reaction jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_name text; v_a text; v_b text; v_pa text; v_pb text; v_aq integer; v_bq integer; v_paq integer; v_pbq integer; v_active boolean; v_equation text; v_fa text; v_fb text; v_fpa text; v_fpb text;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='teacher') then raise exception 'Alleen de leerkracht kan reacties beheren.'; end if;
 v_id:=nullif(p_reaction->>'id','')::uuid; v_name:=trim(coalesce(p_reaction->>'name','')); v_a:=p_reaction->>'reactant_a_id';v_b:=p_reaction->>'reactant_b_id';v_pa:=p_reaction->>'product_a_id';v_pb:=nullif(p_reaction->>'product_b_id','');
 v_aq:=coalesce((p_reaction->>'reactant_a_qty')::integer,0);v_bq:=coalesce((p_reaction->>'reactant_b_qty')::integer,0);v_paq:=coalesce((p_reaction->>'product_a_qty')::integer,0);v_pbq:=coalesce((p_reaction->>'product_b_qty')::integer,0);
 v_active:=coalesce((p_reaction->>'active')::boolean,true);v_equation:=trim(coalesce(p_reaction->>'equation_text',''));
 if v_name='' or v_a is null or v_b is null or v_pa is null or v_a=v_b then raise exception 'Vul twee verschillende beginstoffen en minstens één reactieproduct in.'; end if;
 if v_aq not between 1 and 99 or v_bq not between 1 and 99 or v_paq not between 1 and 99 then raise exception 'Coëfficiënten moeten tussen 1 en 99 liggen.'; end if;
 if v_pb is null then v_pbq:=0; elsif v_pbq not between 1 and 99 then raise exception 'De hoeveelheid van het tweede product moet tussen 1 en 99 liggen.'; end if;
 if not exists(select 1 from public.card_catalog where id=v_a) or not exists(select 1 from public.card_catalog where id=v_b) or not exists(select 1 from public.card_catalog where id=v_pa) then raise exception 'Een gekozen beginstof of reactieproduct bestaat niet.'; end if;
 if v_pb is not null and not exists(select 1 from public.card_catalog where id=v_pb) then raise exception 'Het tweede reactieproduct bestaat niet.'; end if;
 if v_equation='' then
   select formula into v_fa from public.card_catalog where id=v_a;
   select formula into v_fb from public.card_catalog where id=v_b;
   select formula into v_fpa from public.card_catalog where id=v_pa;
   if v_pb is not null then select formula into v_fpb from public.card_catalog where id=v_pb; end if;
   v_equation:=v_aq||' '||v_fa||' + '||v_bq||' '||v_fb||' → '||v_paq||' '||v_fpa||case when v_pb is not null then ' + '||v_pbq||' '||v_fpb else '' end;
 end if;
 if exists(select 1 from public.card_reactions r where r.active=true and (v_id is null or r.id<>v_id) and ((r.reactant_a_id=v_a and r.reactant_b_id=v_b) or (r.reactant_a_id=v_b and r.reactant_b_id=v_a))) then raise exception 'Er bestaat al een actieve reactie voor deze twee beginstoffen.'; end if;
 if v_id is null then
   insert into public.card_reactions(name,reactant_a_id,reactant_a_qty,reactant_b_id,reactant_b_qty,product_a_id,product_a_qty,product_b_id,product_b_qty,equation_text,active)
   values(v_name,v_a,v_aq,v_b,v_bq,v_pa,v_paq,v_pb,v_pbq,v_equation,v_active) returning id into v_id;
 else
   update public.card_reactions set name=v_name,reactant_a_id=v_a,reactant_a_qty=v_aq,reactant_b_id=v_b,reactant_b_qty=v_bq,product_a_id=v_pa,product_a_qty=v_paq,product_b_id=v_pb,product_b_qty=v_pbq,equation_text=v_equation,active=v_active,updated_at=now() where id=v_id;
   if not found then raise exception 'Deze reactie bestaat niet meer.'; end if;
 end if;
 return jsonb_build_object('ok',true,'reaction_id',v_id);
end; $$;

create or replace function public.teacher_archive_reaction(p_reaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'Alleen de leerkracht kan reacties beheren.'; end if;
 update public.card_reactions set active=false,updated_at=now() where id=p_reaction_id;
 if not found then raise exception 'Reactie niet gevonden.'; end if;
 return jsonb_build_object('ok',true);
end; $$;

create or replace function public.teacher_set_battle_settings(p_starting_hp integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='teacher') then raise exception 'Alleen de leerkracht kan battle-instellingen wijzigen.'; end if;
 if p_starting_hp not between 1 and 200 then raise exception 'Startlevenskracht moet tussen 1 en 200 liggen.'; end if;
 update public.battle_settings set starting_hp=p_starting_hp,updated_at=now() where singleton=true;
 return jsonb_build_object('ok',true,'starting_hp',p_starting_hp);
end; $$;

-- Toegangsregels voor nieuwe tabellen. Kaarten en reacties zijn spelinhoud; battledecks
-- zijn alleen zichtbaar voor de eigenaar, zodat de tegenstander de ongebruikte hand niet ziet.
alter table public.card_reactions enable row level security;
alter table public.battle_settings enable row level security;
alter table public.battle_decks enable row level security;
drop policy if exists card_reactions_auth_read on public.card_reactions;
create policy card_reactions_auth_read on public.card_reactions for select to authenticated using (true);
drop policy if exists battle_settings_auth_read on public.battle_settings;
create policy battle_settings_auth_read on public.battle_settings for select to authenticated using (true);
drop policy if exists battle_decks_owner_read on public.battle_decks;
create policy battle_decks_owner_read on public.battle_decks for select to authenticated using (user_id=(select auth.uid()) and public.is_battle_participant_same_class(battle_id));
revoke all on public.card_reactions,public.battle_settings,public.battle_decks from anon,authenticated;
grant select on public.card_reactions,public.battle_settings,public.battle_decks to authenticated;
revoke all on function public.buy_card(text) from public,anon;
revoke all on function public.perform_card_reaction(uuid) from public,anon;
revoke all on function public.create_battle(text,text[]) from public,anon;
revoke all on function public.respond_to_battle(uuid,boolean,text[]) from public,anon;
revoke all on function public.play_battle_card(uuid,integer) from public,anon;
revoke all on function public.get_my_battles() from public,anon;
revoke all on function public.teacher_save_card(jsonb) from public,anon;
revoke all on function public.teacher_save_reaction(jsonb) from public,anon;
revoke all on function public.teacher_archive_reaction(uuid) from public,anon;
revoke all on function public.teacher_set_battle_settings(integer) from public,anon;
grant execute on function public.buy_card(text) to authenticated;
grant execute on function public.perform_card_reaction(uuid) to authenticated;
grant execute on function public.create_battle(text,text[]) to authenticated;
grant execute on function public.respond_to_battle(uuid,boolean,text[]) to authenticated;
grant execute on function public.play_battle_card(uuid,integer) to authenticated;
grant execute on function public.get_my_battles() to authenticated;
grant execute on function public.teacher_save_card(jsonb) to authenticated;
grant execute on function public.teacher_save_reaction(jsonb) to authenticated;
grant execute on function public.teacher_archive_reaction(uuid) to authenticated;
grant execute on function public.teacher_set_battle_settings(integer) to authenticated;

comment on table public.card_reactions is 'Leerkracht beheerde kaartreacties met twee beginstoffen en maximaal twee producten.';
comment on table public.battle_decks is 'Vijf kaartslots per speler en battle; meerdere exemplaren van dezelfde kaart zijn toegestaan.';
