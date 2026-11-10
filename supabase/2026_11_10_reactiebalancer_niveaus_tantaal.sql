-- Chemie Escape Room: niveaukeuze Reactiebalancer, unieke voortgang, eenmalige Tantaalbeloning.
-- Uitvoeren NA de bonusspel- en kaartmigraties. Maak eerst een back-up.
begin;
alter table public.card_catalog add column if not exists is_bonus_reward boolean not null default false;
alter table public.card_catalog add column if not exists bonus_reward_code text;
create table if not exists public.reaction_bonus_correct (
 user_id uuid not null references public.profiles(id) on delete cascade,
 item_id uuid not null references public.bonus_game_items(id) on delete cascade,
 first_correct_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.reaction_bonus_tantalum_awards (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 awarded_at timestamptz not null default now()
);
alter table public.reaction_bonus_correct enable row level security;
alter table public.reaction_bonus_tantalum_awards enable row level security;
revoke all on public.reaction_bonus_correct,public.reaction_bonus_tantalum_awards from public,anon,authenticated;
-- Een bestaande tantaalkaart blijft bewerkbaar, maar wordt een exclusieve beloning.
update public.card_catalog set is_shop_item=false,is_reward_only=false,is_bonus_reward=true,bonus_reward_code='reaction_master' where formula='Ta';
insert into public.card_catalog(id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only)
select 'tantalum','Tantaal','Ta','metaal','Speciale beloning',0,5,5,
 'Exclusieve beloning voor het correct balanceren van alle actieve reacties.','metaal',5,false,false
where not exists(select 1 from public.card_catalog where formula='Ta');
update public.card_catalog set is_bonus_reward=true,bonus_reward_code='reaction_master' where formula='Ta';
create or replace function public.start_reaction_bonus_game(p_difficulty text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_ids uuid[]; v_session public.bonus_game_sessions%rowtype; v_items jsonb; v_timed boolean;
begin
 if v_uid is null then raise exception 'Log eerst in.'; end if;
 if p_difficulty not in ('basis','gemiddeld','moeilijk') then raise exception 'Onbekende moeilijkheidsgraad.'; end if;
 v_timed:=false;
 select array_agg(id order by random()) into v_ids from public.bonus_game_items where game_type='reaction' and difficulty=p_difficulty and is_active;
 if coalesce(array_length(v_ids,1),0) < (case when v_timed then 1 else 5 end) then raise exception 'Er zijn nog onvoldoende actieve vragen voor dit bonusspel.'; end if;
 if not v_timed then v_ids:=v_ids[1:5]; end if;
 insert into public.bonus_game_sessions(user_id,game_type,item_ids,expires_at) values(v_uid,'reaction',v_ids,case when v_timed then now()+interval '60 seconds' else null end) returning * into v_session;
 select jsonb_agg(jsonb_build_object('id',i.id,'prompt',i.prompt,'answer','','accepted_answers',case when false then i.accepted_answers else '[]'::jsonb end,'category',i.category,'difficulty',i.difficulty,'model',case when false then '{}'::jsonb else i.model end,'explanation',i.explanation) order by x.ord)
 into v_items from unnest(v_ids) with ordinality x(id,ord) join public.bonus_game_items i on i.id=x.id;
 return jsonb_build_object('session_id',v_session.id,'game_type','reaction','difficulty',p_difficulty,'items',coalesce(v_items,'[]'::jsonb),'expires_at',v_session.expires_at);
end $$;
revoke all on function public.start_reaction_bonus_game(text) from public,anon;
grant execute on function public.start_reaction_bonus_game(text) to authenticated;

create or replace function public.reaction_bonus_progress()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_levels jsonb; v_awarded boolean;
begin
 if v_uid is null then raise exception 'Log eerst in.'; end if;
 select jsonb_agg(jsonb_build_object('difficulty',d.difficulty,'total',
 (select count(*) from public.bonus_game_items i where i.game_type='reaction' and i.is_active and i.difficulty=d.difficulty),
 'correct',(select count(*) from public.reaction_bonus_correct r join public.bonus_game_items i on i.id=r.item_id
 where r.user_id=v_uid and i.game_type='reaction' and i.is_active and i.difficulty=d.difficulty)) order by d.rank)
 into v_levels from (values ('basis',1),('gemiddeld',2),('moeilijk',3)) d(difficulty,rank);
 select exists(select 1 from public.reaction_bonus_tantalum_awards where user_id=v_uid) into v_awarded;
 return jsonb_build_object('levels',v_levels,'reward_awarded',v_awarded);
end $$;
revoke all on function public.reaction_bonus_progress() from public,anon;
grant execute on function public.reaction_bonus_progress() to authenticated;

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
 -- Registratie is per unieke reactie, niet per sessie of vraagpositie.\n if v_ok and v_s.game_type='reaction' then\n   insert into public.reaction_bonus_correct(user_id,item_id) values(v_uid,v_item.id) on conflict do nothing;\n   select count(*) into v_total from public.bonus_game_items where game_type='reaction' and is_active;\n   select count(*) into v_done from public.reaction_bonus_correct r join public.bonus_game_items i on i.id=r.item_id\n     where r.user_id=v_uid and i.game_type='reaction' and i.is_active;\n   if v_total>0 and v_done=v_total then\n     -- Eén beloning per leerling; een gelijktijdige inzending kan niet dubbel belonen.\n     insert into public.reaction_bonus_tantalum_awards(user_id) values(v_uid) on conflict do nothing;\n     if found then\n       select id into v_tantalum_id from public.card_catalog where formula='Ta' order by (id='tantalum') desc limit 1;\n       if v_tantalum_id is null then raise exception 'De tantaalkaart ontbreekt in de kaartenbank.'; end if;\n       insert into public.user_cards(user_id,card_id,quantity) values(v_uid,v_tantalum_id,1)\n         on conflict(user_id,card_id) do update set quantity=public.user_cards.quantity+1;\n       v_tantalum_awarded:=true;\n     end if;\n   end if;\n end if;\n update public.bonus_game_sessions set answered_count=answered_count+1,correct_count=correct_count+case when v_ok then 1 else 0 end,earned_coins=earned_coins+v_reward,
 finished_at=case when (expires_at is null and p_sequence=cardinality(item_ids)) or (expires_at is not null and now()>=expires_at) then now() else finished_at end where id=v_s.id;
 if v_reward>0 then update public.profiles set coins=coins+v_reward,xp=xp+2 where id=v_uid returning coins into v_coins; else select coins into v_coins from public.profiles where id=v_uid; end if;
 v_expected:=case when v_s.game_type='naming' then (select string_agg(value,', ') from jsonb_array_elements_text(v_item.accepted_answers)) when v_s.game_type='lewis' then 'De goedgekeurde Lewisstructuur' when v_s.game_type='classification' then v_item.category else coalesce(v_item.answer,v_item.category) end;
 return jsonb_build_object('ok',true,'correct',v_ok,'expected_answer',v_expected,'explanation',v_item.explanation,'reward',v_reward,'correct_count',v_s.correct_count+case when v_ok then 1 else 0 end,'answered_count',v_s.answered_count+1,'coins',v_coins,'tantalum_awarded',v_tantalum_awarded,'finished',(v_s.expires_at is null and p_sequence=cardinality(v_s.item_ids)) or (v_s.expires_at is not null and now()>=v_s.expires_at));
end $$;
revoke all on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) to authenticated;
commit;
