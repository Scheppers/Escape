-- Chemie Escape Room: 1 XP per juist Elementensprint-symbool,
-- levelkaarten op 25/50/100, veilige uitgebreide klasranking.
-- Uitvoeren NA de bestaande migraties, in de Supabase SQL Editor.

-- De bestaande Elementensprint-beloningen in LabCoins blijven ongewijzigd.
create or replace function public.submit_element_answer(p_session_id uuid,p_element_name text,p_symbol text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.sprint_sessions%rowtype; v_i public.sprint_session_items%rowtype;
 v_symbol text; v_correct boolean; v_reward integer:=0; v_new_correct integer; v_new_answered integer; v_coins integer; v_xp integer;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select * into v_s from public.sprint_sessions where id=p_session_id and user_id=v_uid for update;
 if not found then raise exception 'Sprint niet gevonden.'; end if;
 if v_s.finished_at is not null then raise exception 'Deze sprint is al afgelopen.'; end if;
 if now()>v_s.expires_at then raise exception 'De minuut is voorbij.'; end if;
 select * into v_i from public.sprint_session_items where session_id=v_s.id and sequence_number=v_s.answered_count+1 for update;
 if not found then raise exception 'Er zijn geen vragen meer in deze sprint.'; end if;
 if p_element_name is distinct from v_i.element_name then raise exception 'De vraagvolgorde klopt niet. Herlaad de sprint.'; end if;
 select symbol into v_symbol from public.element_bank where element_name=v_i.element_name;
 v_correct:=(p_symbol=v_symbol);
 if v_correct then v_reward:=floor(v_s.correct_count::numeric/5)::integer+1; end if;
 v_new_correct:=v_s.correct_count+case when v_correct then 1 else 0 end;
 v_new_answered:=v_s.answered_count+1;
 update public.sprint_session_items set answered_at=now(),is_correct=v_correct,reward=v_reward where session_id=v_s.id and sequence_number=v_i.sequence_number;
 insert into public.sprint_answers(session_id,user_id,element_name,answer_text,is_correct,reward) values(v_s.id,v_uid,v_i.element_name,coalesce(p_symbol,''),v_correct,v_reward);
 update public.sprint_sessions set correct_count=v_new_correct,answered_count=v_new_answered where id=v_s.id;
 update public.profiles set coins=coins+v_reward,xp=xp+case when v_correct then 1 else 0 end where id=v_uid returning coins,xp into v_coins,v_xp;
 return jsonb_build_object('ok',true,'correct',v_correct,'symbol',v_symbol,'reward',v_reward,'correct_count',v_new_correct,'answered_count',v_new_answered,'coins',v_coins,'xp',v_xp,'expires_at',v_s.expires_at);
end; $$;
revoke all on function public.submit_element_answer(uuid,text,text) from public,anon;
grant execute on function public.submit_element_answer(uuid,text,text) to authenticated;

-- Unieke exclusieve elementkaarten; niet te koop en geen willekeurige battleloot.
insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only,is_bonus_reward,bonus_reward_code)
values
 ('gadolinium','Gadolinium','Gd','Metaal','Exclusief',0,7,7,'Exclusieve beloning voor level 25.','vaste stof',7,false,false,true,'level_25'),
 ('terbium','Terbium','Tb','Metaal','Exclusief',0,8,8,'Exclusieve beloning voor level 50.','vaste stof',8,false,false,true,'level_50'),
 ('dysprosium','Dysprosium','Dy','Metaal','Exclusief',0,9,9,'Exclusieve beloning voor level 100.','vaste stof',9,false,false,true,'level_100')
on conflict(id) do update set name=excluded.name,formula=excluded.formula,category=excluded.category,rarity=excluded.rarity,
 price=excluded.price,attack=excluded.attack,shield=excluded.shield,description=excluded.description,
 is_shop_item=false,is_reward_only=false,is_bonus_reward=true,bonus_reward_code=excluded.bonus_reward_code;

-- Eén centrale trigger: ongeacht hoe XP verdiend wordt, kaarten zodra een level bereikt is.
create or replace function public.award_xp_level_cards() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.xp >= 2400 then
   insert into public.user_cards(user_id,card_id) values(new.id,'gadolinium') on conflict do nothing;
 end if;
 if new.xp >= 4900 then
   insert into public.user_cards(user_id,card_id) values(new.id,'terbium') on conflict do nothing;
 end if;
 if new.xp >= 9900 then
   insert into public.user_cards(user_id,card_id) values(new.id,'dysprosium') on conflict do nothing;
 end if;
 return new;
end; $$;
drop trigger if exists trg_award_xp_level_cards on public.profiles;
create trigger trg_award_xp_level_cards after insert or update of xp on public.profiles
for each row execute function public.award_xp_level_cards();

-- Ook spelers die het level al vóór deze update bereikten krijgen hun kaart.
insert into public.user_cards(user_id,card_id)
select id,'gadolinium' from public.profiles where xp>=2400 on conflict do nothing;
insert into public.user_cards(user_id,card_id)
select id,'terbium' from public.profiles where xp>=4900 on conflict do nothing;
insert into public.user_cards(user_id,card_id)
select id,'dysprosium' from public.profiles where xp>=9900 on conflict do nothing;

-- Nieuwe functienaam voorkomt PostgreSQL 42P13 (bestaand returntype wijzigen).
-- Zelfde klasbeveiliging als de bestaande get_leaderboard(integer,uuid).
create or replace function public.get_class_leaderboard_stats(p_limit integer default 50,p_class_id uuid default null)
returns table(username text,xp integer,level integer,card_count bigint,wins bigint,draws bigint,losses bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_role text; v_home_class uuid; v_target uuid;
begin
 if v_uid is null then raise exception 'Meld je eerst aan.'; end if;
 select p.role,p.class_id into v_role,v_home_class from public.profiles p where p.id=v_uid;
 if not found then raise exception 'Je accountprofiel werd niet gevonden.'; end if;
 if v_role='teacher' then
   v_target:=coalesce(p_class_id,v_home_class);
   if v_target is null or not exists(select 1 from public.classes c where c.id=v_target and (c.owner_teacher_id=v_uid or (c.owner_teacher_id is null and c.id=v_home_class))) then
     raise exception 'Je kunt alleen de ranking van je eigen klassen bekijken.';
   end if;
 else
   v_target:=v_home_class;
   if v_target is null then raise exception 'Je account is nog niet aan een klas gekoppeld.'; end if;
   if p_class_id is not null and p_class_id<>v_target then raise exception 'Je kunt alleen de ranking van je eigen klas bekijken.'; end if;
 end if;
 return query
 select p.username,p.xp,(p.xp/100)+1,
   (select count(*) from public.user_cards uc where uc.user_id=p.id and uc.quantity>0),
   (select count(*) from public.battles b where b.status='completed' and b.winner_id=p.id and (b.challenger_id=p.id or b.opponent_id=p.id)),
   (select count(*) from public.battles b where b.status='completed' and b.winner_id is null and (b.challenger_id=p.id or b.opponent_id=p.id)),
   (select count(*) from public.battles b where b.status='completed' and b.winner_id is not null and b.winner_id<>p.id and (b.challenger_id=p.id or b.opponent_id=p.id))
 from public.profiles p where p.class_id=v_target and p.role='student'
 order by p.xp desc,p.created_at asc limit least(greatest(coalesce(p_limit,50),1),200);
end; $$;
revoke all on function public.get_class_leaderboard_stats(integer,uuid) from public,anon;
grant execute on function public.get_class_leaderboard_stats(integer,uuid) to authenticated;
