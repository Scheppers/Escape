-- Meerdere klassen per leerkracht + klasspecifieke ranking.
-- Voer dit bestand één keer uit in Supabase SQL Editor.
-- Leerlingen blijven aan precies één klas gekoppeld. Battles blijven beperkt
-- tot spelers met hetzelfde class_id.

begin;

alter table public.classes
  add column if not exists owner_teacher_id uuid references auth.users(id) on delete cascade;

-- Koppel bestaande klas(sen) automatisch aan de leerkracht die de klas
-- oorspronkelijk beheerde (de eerste leerkracht heeft class_id op het profiel).
update public.classes c
set owner_teacher_id = p.id
from public.profiles p
where p.role = 'teacher'
  and p.class_id = c.id
  and c.owner_teacher_id is null;

create index if not exists classes_owner_teacher_idx
  on public.classes(owner_teacher_id, name);

-- Leerlingen mogen hun eigen klas blijven zien; een leerkracht mag ook alle
-- klassen zien die aan zijn/haar account gekoppeld zijn.
drop policy if exists classes_same_class_read on public.classes;
drop policy if exists classes_teacher_or_same_class_read on public.classes;
create policy classes_teacher_or_same_class_read
  on public.classes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (
          p.class_id = classes.id
          or (p.role = 'teacher' and classes.owner_teacher_id = p.id)
        )
    )
  );

-- De leerkracht kan een ranking kiezen uit uitsluitend de eigen klassen.
-- Leerlingen kunnen de parameter niet gebruiken om een andere klas te bekijken.
drop function if exists public.get_leaderboard(integer);
create function public.get_leaderboard(
  p_limit integer default 10,
  p_class_id uuid default null
)
returns table(position bigint, username text, xp integer, level integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_home_class_id uuid;
  v_target_class_id uuid;
begin
  if v_uid is null then
    raise exception 'Meld je eerst aan.';
  end if;

  select p.role, p.class_id
    into v_role, v_home_class_id
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'Je accountprofiel werd niet gevonden.';
  end if;

  if v_role = 'teacher' then
    v_target_class_id := coalesce(p_class_id, v_home_class_id);
    if v_target_class_id is null or not exists (
      select 1
      from public.classes c
      where c.id = v_target_class_id
        and (c.owner_teacher_id = v_uid or (c.owner_teacher_id is null and c.id = v_home_class_id))
    ) then
      raise exception 'Je kunt alleen de ranking van je eigen klassen bekijken.';
    end if;
  else
    v_target_class_id := v_home_class_id;
    if v_target_class_id is null then
      raise exception 'Je account is nog niet aan een klas gekoppeld.';
    end if;
    if p_class_id is not null and p_class_id <> v_target_class_id then
      raise exception 'Je kunt alleen de ranking van je eigen klas bekijken.';
    end if;
  end if;

  return query
    select
      row_number() over(order by p.xp desc, p.created_at asc),
      p.username,
      p.xp,
      (p.xp / 100) + 1
    from public.profiles p
    where p.class_id = v_target_class_id
      and p.role = 'student'
    order by p.xp desc, p.created_at asc
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

revoke all on function public.get_leaderboard(integer, uuid) from public, anon;
grant execute on function public.get_leaderboard(integer, uuid) to authenticated;

comment on column public.classes.owner_teacher_id is
  'Auth-user-id van de leerkracht die deze klas beheert; leerlingen in de klas vormen één ranking- en battlegroep.';

commit;
