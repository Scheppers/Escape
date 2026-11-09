-- Drie nieuwe bonusspellen. Additieve migratie: bestaande tabellen en leerlinggegevens blijven onaangeroerd.
create table if not exists public.bonus_game_items (
 id uuid primary key default gen_random_uuid(),
 game_type text not null check (game_type in ('reaction','classification','naming','lewis')),
 prompt text not null check (length(trim(prompt)) between 1 and 1000),
 answer text not null default '',
 accepted_answers jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_answers)='array'),
 category text not null default '',
 difficulty text not null default 'basis' check (difficulty in ('basis','gemiddeld','moeilijk')),
 model jsonb not null default '{}'::jsonb,
 accepted_models jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_models)='array'),
 explanation text not null default '',
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.bonus_game_items add column if not exists accepted_models jsonb not null default '[]'::jsonb;
create index if not exists bonus_game_items_active_idx on public.bonus_game_items(game_type,is_active);
create table if not exists public.bonus_game_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 game_type text not null check (game_type in ('reaction','classification','naming','lewis')),
 item_ids uuid[] not null,
 started_at timestamptz not null default now(),
 expires_at timestamptz,
 answered_count integer not null default 0,
 correct_count integer not null default 0,
 earned_coins integer not null default 0,
 finished_at timestamptz
);
create index if not exists bonus_game_sessions_user_idx on public.bonus_game_sessions(user_id,started_at desc);
alter table public.bonus_game_items enable row level security;
alter table public.bonus_game_sessions enable row level security;
drop policy if exists bonus_items_read_active on public.bonus_game_items;
create policy bonus_items_read_active on public.bonus_game_items for select to authenticated using (is_active or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
drop policy if exists bonus_items_teacher_all on public.bonus_game_items;
create policy bonus_items_teacher_all on public.bonus_game_items for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
drop policy if exists bonus_sessions_owner_read on public.bonus_game_sessions;
create policy bonus_sessions_owner_read on public.bonus_game_sessions for select to authenticated using (user_id=auth.uid());

-- Graph-isomorfie voor Lewisstructuren: atoomvolgorde en tekenposities zijn niet relevant.
create or replace function public.bonus_graph_matches(p_student jsonb,p_model jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare v_n integer; v_m integer; v_sb integer; v_mb integer;
begin
 if jsonb_typeof(p_student->'atoms')<>'array' or jsonb_typeof(p_model->'atoms')<>'array'
    or jsonb_typeof(p_student->'bonds')<>'array' or jsonb_typeof(p_model->'bonds')<>'array' then return false; end if;
 v_n:=jsonb_array_length(p_student->'atoms'); v_m:=jsonb_array_length(p_model->'atoms');
 if v_n=0 or v_n<>v_m or v_n>14 then return false; end if;
 v_sb:=jsonb_array_length(p_student->'bonds'); v_mb:=jsonb_array_length(p_model->'bonds');
 if v_sb<>v_mb then return false; end if;
 return exists (
  with recursive permutations(pos,mapping,used) as (
   select 0, array[]::integer[], array[]::integer[]
   union all
   select p.pos+1,p.mapping||candidate.idx,p.used||candidate.idx
   from permutations p
   cross join lateral (
    select j-1 as idx
    from generate_series(1,v_n) j
    where not ((j-1)=any(p.used))
      and p_student->'atoms'->(j-1)->>'element'=p_model->'atoms'->p.pos->>'element'
      and (select count(*) from jsonb_array_elements(p_student->'bonds') b where (b->>'a')::int=j-1 or (b->>'b')::int=j-1)
          =(select count(*) from jsonb_array_elements(p_model->'bonds') b where (b->>'a')::int=p.pos or (b->>'b')::int=p.pos)
      and coalesce((select (l->>'count')::int from jsonb_array_elements(p_student->'lonePairs') l where (l->>'atom')::int=j-1),0)
          =coalesce((select (l->>'count')::int from jsonb_array_elements(p_model->'lonePairs') l where (l->>'atom')::int=p.pos),0)
   ) candidate
   where p.pos<v_n
  )
  select 1 from permutations p
  where p.pos=v_n
    and not exists (
      select 1 from jsonb_array_elements(p_model->'bonds') mb
      where not exists (
       select 1 from jsonb_array_elements(p_student->'bonds') sb
       where least((sb->>'a')::int,(sb->>'b')::int)=least(p.mapping[(mb->>'a')::int+1],p.mapping[(mb->>'b')::int+1])
         and greatest((sb->>'a')::int,(sb->>'b')::int)=greatest(p.mapping[(mb->>'a')::int+1],p.mapping[(mb->>'b')::int+1])
         and (sb->>'order')::int=(mb->>'order')::int
      )
    )
    and not exists (
      select 1 from jsonb_array_elements(p_model->'lonePairs') ml
      where coalesce((select (sl->>'count')::int from jsonb_array_elements(p_student->'lonePairs') sl where (sl->>'atom')::int=p.mapping[(ml->>'atom')::int+1]),0)<>(ml->>'count')::int
    )
 );
exception when others then return false;
end $$;

create or replace function public.start_bonus_game(p_game_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_ids uuid[]; v_session public.bonus_game_sessions%rowtype; v_items jsonb; v_timed boolean;
begin
 if v_uid is null then raise exception 'Log eerst in.'; end if;
 if p_game_type not in ('reaction','classification','naming','lewis') then raise exception 'Onbekend bonusspel.'; end if;
 v_timed:=p_game_type in ('classification','naming');
 select array_agg(id order by random()) into v_ids from public.bonus_game_items where game_type=p_game_type and is_active;
 if coalesce(array_length(v_ids,1),0) < (case when v_timed then 1 else 5 end) then raise exception 'Er zijn nog onvoldoende actieve vragen voor dit bonusspel.'; end if;
 if not v_timed then v_ids:=v_ids[1:5]; end if;
 insert into public.bonus_game_sessions(user_id,game_type,item_ids,expires_at) values(v_uid,p_game_type,v_ids,case when v_timed then now()+interval '60 seconds' else null end) returning * into v_session;
 select jsonb_agg(jsonb_build_object('id',i.id,'prompt',i.prompt,'answer','','accepted_answers',case when p_game_type='naming' then i.accepted_answers else '[]'::jsonb end,'category',i.category,'difficulty',i.difficulty,'model',case when p_game_type='lewis' then '{}'::jsonb else i.model end,'explanation',i.explanation) order by x.ord)
 into v_items from unnest(v_ids) with ordinality x(id,ord) join public.bonus_game_items i on i.id=x.id;
 return jsonb_build_object('session_id',v_session.id,'game_type',p_game_type,'items',coalesce(v_items,'[]'::jsonb),'expires_at',v_session.expires_at);
end $$;

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
   if v_s.game_type='reaction' then v_reward:=p_sequence;
   elsif v_s.game_type='lewis' then v_reward:=3*p_sequence;
   elsif v_s.game_type='classification' then v_reward:=((v_s.correct_count)/10)+1;
   elsif v_s.game_type='naming' then v_reward:=((v_s.correct_count)/5)+1; end if;
 end if;
 update public.bonus_game_sessions set answered_count=answered_count+1,correct_count=correct_count+case when v_ok then 1 else 0 end,earned_coins=earned_coins+v_reward,
 finished_at=case when (expires_at is null and p_sequence=cardinality(item_ids)) or (expires_at is not null and now()>=expires_at) then now() else finished_at end where id=v_s.id;
 if v_reward>0 then update public.profiles set coins=coins+v_reward,xp=xp+2 where id=v_uid returning coins into v_coins; else select coins into v_coins from public.profiles where id=v_uid; end if;
 v_expected:=case when v_s.game_type='naming' then (select string_agg(value,', ') from jsonb_array_elements_text(v_item.accepted_answers)) when v_s.game_type='lewis' then 'De goedgekeurde Lewisstructuur' when v_s.game_type='classification' then v_item.category else coalesce(v_item.answer,v_item.category) end;
 return jsonb_build_object('ok',true,'correct',v_ok,'expected_answer',v_expected,'explanation',v_item.explanation,'reward',v_reward,'correct_count',v_s.correct_count+case when v_ok then 1 else 0 end,'answered_count',v_s.answered_count+1,'coins',v_coins,'finished',(v_s.expires_at is null and p_sequence=cardinality(v_s.item_ids)) or (v_s.expires_at is not null and now()>=v_s.expires_at));
end $$;

create or replace function public.finish_bonus_game(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_s public.bonus_game_sessions%rowtype; v_coins integer;
begin
 update public.bonus_game_sessions set finished_at=coalesce(finished_at,now()) where id=p_session_id and user_id=v_uid returning * into v_s;
 if not found then raise exception 'Spelronde niet gevonden.'; end if;
 select coins into v_coins from public.profiles where id=v_uid;
 return jsonb_build_object('ok',true,'correct_count',v_s.correct_count,'answered_count',v_s.answered_count,'earned_coins',v_s.earned_coins,'coins',v_coins);
end $$;
revoke all on function public.bonus_graph_matches(jsonb,jsonb) from public;
grant execute on function public.bonus_graph_matches(jsonb,jsonb) to authenticated;
revoke all on function public.start_bonus_game(text) from public;
revoke all on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) from public;
revoke all on function public.finish_bonus_game(uuid) from public;
grant execute on function public.start_bonus_game(text) to authenticated;
grant execute on function public.submit_bonus_game_answer(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.finish_bonus_game(uuid) to authenticated;
