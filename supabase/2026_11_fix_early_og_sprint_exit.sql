-- Laat The OG of chemistry ook voortijdig afsluiten via het kruisje.
-- Reeds verdiende coins en XP blijven behouden: die worden per juist antwoord
-- in submit_oxidation_sprint_answer() toegekend.
-- Deze functie markeert alleen de sessie als afgesloten en betaalt niets opnieuw uit.

create or replace function public.finish_oxidation_sprint(p_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session public.oxidation_sprint_sessions%rowtype;
  v_coins integer;
  v_xp integer;
begin
  if v_uid is null then
    raise exception 'Meld je eerst aan.';
  end if;

  select * into v_session
    from public.oxidation_sprint_sessions
    where id = p_session_id and user_id = v_uid
    for update;

  if not found then
    raise exception 'The OG of chemistry-sprint niet gevonden.';
  end if;

  -- Geen controle op expires_at: de speler mag ook zelf voortijdig stoppen.
  update public.oxidation_sprint_sessions
    set finished_at = coalesce(finished_at, now())
    where id = v_session.id;

  select coins, xp into v_coins, v_xp
    from public.profiles
    where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'correct_count', v_session.correct_count,
    'answered_count', v_session.answered_count,
    'coins', coalesce(v_coins, 0),
    'xp', coalesce(v_xp, 0)
  );
end;
$function$;

grant execute on function public.finish_oxidation_sprint(uuid) to authenticated;
