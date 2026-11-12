-- Syntheselabo: voer uit NA de bestaande kaartenmigraties. Alle mutaties via SECURITY DEFINER RPC.
-- Belgische kalenderdag voor de verkooplimiet.
create table if not exists public.synth_labs (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 owned text[] not null default '{}'::text[],
 ammonia_unlocked boolean not null default false,
 urea_unlocked boolean not null default false,
 ammonia_stock integer not null default 0 check(ammonia_stock between 0 and 1000),
 urea_stock integer not null default 0 check(urea_stock between 0 and 1000),
 last_urea_sale date,
 created_at timestamptz not null default now()
);
alter table public.synth_labs enable row level security;
revoke all on public.synth_labs from anon,authenticated;

-- Exclusieve kaarten. Ammoniak bestaat mogelijk al in de catalogus.
insert into public.card_catalog (id,name,formula,category,rarity,price,attack,shield,description,card_type,power,is_shop_item,is_reward_only)
values ('ammonia','Ammoniak','NH₃','Verbinding','Synthese-exclusief',0,3,3,'Verkregen bij de eerste ammoniaksynthese.','gas',3,false,true),
       ('synth_urea','Ureum','CO(NH₂)₂','Verbinding','Synthese-exclusief',0,3,4,'Verkregen bij de eerste ureumsynthese.','gas',3,false,true)
on conflict(id) do update set is_shop_item=false,is_reward_only=true,rarity='Synthese-exclusief';

create or replace function public.synth_get_state()
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); s public.synth_labs%rowtype; c integer;
begin
 if u is null then raise exception 'Meld je eerst aan.'; end if;
 insert into public.synth_labs(user_id) values(u) on conflict do nothing;
 select * into s from public.synth_labs where user_id=u;
 select coins into c from public.profiles where id=u;
 return jsonb_build_object('owned',s.owned,'ammonia_unlocked',s.ammonia_unlocked,'urea_unlocked',s.urea_unlocked,'ammonia_stock',s.ammonia_stock,'urea_stock',s.urea_stock,'sold_today',s.last_urea_sale=(now() at time zone 'Europe/Brussels')::date,'coins',c);
end $$;

create or replace function public.synth_action(p_action text, p_item text default null, p_temperature integer default null, p_pressure integer default null, p_ratio integer default null, p_catalyst text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 u uuid:=auth.uid(); s public.synth_labs%rowtype; balance integer; price integer; needed text[]; code text; today_be date:=(now() at time zone 'Europe/Brussels')::date;
begin
 if u is null then raise exception 'Meld je eerst aan.'; end if;
 insert into public.synth_labs(user_id) values(u) on conflict do nothing;
 select * into s from public.synth_labs where user_id=u for update;
 select coins into balance from public.profiles where id=u for update;
 if p_action='buy' then
  price:=case p_item
   when 'compressor' then 150 when 'heater' then 100 when 'reactor' then 250 when 'condenser' then 200 when 'nh3tank' then 100
   when 'co2tank' then 100 when 'ureareactor' then 250 when 'separator' then 200 when 'crystallizer' then 200 when 'dryer' then 150 when 'ureasilo' then 100
   else null end;
  if price is null then raise exception 'Onbekend toestel.'; end if;
  if p_item=any(s.owned) then raise exception 'Je hebt dit toestel al.'; end if;
  if p_item=any(array['co2tank','ureareactor','separator','crystallizer','dryer','ureasilo']) and not s.ammonia_unlocked then
   raise exception 'Ontgrendel eerst de ureumfabriek door ammoniak te maken.';
  end if;
  if balance<price then raise exception 'Niet genoeg LabCoins.'; end if;
  update public.profiles set coins=coins-price where id=u;
  update public.synth_labs set owned=array_append(owned,p_item) where user_id=u;
 elsif p_action='ammonia' then
  needed:=array['compressor','heater','reactor','condenser','nh3tank'];
  if not s.owned@>needed then raise exception 'Bouw eerst alle toestellen van de ammoniakfabriek.'; end if;
  if p_temperature is distinct from 450 or p_pressure is distinct from 200 or p_ratio is distinct from 3 or p_catalyst is distinct from 'Fe' then
   raise exception 'De instellingen zijn nog niet geschikt. Lees de informatie over het Haber-Boschproces.';
  end if;
  if s.ammonia_stock>=1000 then raise exception 'De ammoniakopslag is vol.'; end if;
  update public.synth_labs set ammonia_stock=ammonia_stock+2,ammonia_unlocked=true where user_id=u;
  if not s.ammonia_unlocked then
   insert into public.user_cards(user_id,card_id) values(u,'ammonia') on conflict do nothing;
  end if;
 elsif p_action='urea' then
  if not s.ammonia_unlocked then raise exception 'Maak eerst ammoniak in labo 1.'; end if;
  needed:=array['co2tank','ureareactor','separator','crystallizer','dryer','ureasilo'];
  if not s.owned@>needed then raise exception 'Bouw eerst alle toestellen van de ureumfabriek.'; end if;
  if s.ammonia_stock<2 then raise exception 'Je hebt 2 eenheden ammoniak nodig.'; end if;
  if s.urea_stock>=1000 then raise exception 'De ureumsilo is vol.'; end if;
  update public.synth_labs set ammonia_stock=ammonia_stock-2,urea_stock=urea_stock+1,urea_unlocked=true where user_id=u;
  if not s.urea_unlocked then
   insert into public.user_cards(user_id,card_id) values(u,'synth_urea') on conflict do nothing;
  end if;
 elsif p_action='sell' then
  if s.last_urea_sale=today_be then raise exception 'Je hebt vandaag al een batch ureum verkocht.'; end if;
  if s.urea_stock<1 then raise exception 'Produceer eerst een batch ureum.'; end if;
  update public.synth_labs set urea_stock=urea_stock-1,last_urea_sale=today_be where user_id=u;
  update public.profiles set coins=coins+50 where id=u;
 else raise exception 'Onbekende handeling.';
 end if;
 return public.synth_get_state();
end $$;
revoke all on function public.synth_get_state() from public;
revoke all on function public.synth_action(text,text,integer,integer,integer,text) from public;
grant execute on function public.synth_get_state() to authenticated;
grant execute on function public.synth_action(text,text,integer,integer,integer,text) to authenticated;
