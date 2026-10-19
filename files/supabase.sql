-- Kjør hele denne filen i Supabase: SQL Editor → New query → Run

create table smaker (
  id text primary key,
  navn text not null,
  pris int not null check (pris >= 0),
  farge text not null default '#6fb800'
);

create table bestillinger (
  id uuid primary key default gen_random_uuid(),
  bruker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dato date not null,
  smak_id text not null references smaker(id),
  antall int not null check (antall between 1 and 3),
  pris int not null,               -- settes av databasen, ikke av nettsiden
  opprettet timestamptz not null default now(),
  unique (bruker_id, dato)
);

-- Prisen hentes alltid fra smaker-tabellen, så den kan ikke juksa med i nettleseren.
-- Gamle bestillinger beholder prisen de ble lagt inn med.
create function sett_pris() returns trigger
language plpgsql set search_path = public as $$
begin
  select pris into new.pris from smaker where id = new.smak_id;
  return new;
end $$;
create trigger bestilling_pris before insert on bestillinger
  for each row execute function sett_pris();

-- Radnivå-sikkerhet: hver bruker ser og endrer bare sine egne bestillinger
alter table smaker enable row level security;
alter table bestillinger enable row level security;

create policy "alle kan se smaker" on smaker for select using (true);

create policy "se egne bestillinger" on bestillinger for select to authenticated
  using (bruker_id = auth.uid());

create policy "legg inn egne bestillinger" on bestillinger for insert to authenticated
  with check (bruker_id = auth.uid() and dato > (now() at time zone 'Europe/Oslo')::date);

create policy "avbestill egne bestillinger" on bestillinger for delete to authenticated
  using (bruker_id = auth.uid() and dato > (now() at time zone 'Europe/Oslo')::date);

insert into smaker (id, navn, pris, farge) values
  ('original',       'Monster Original', 29, '#6fb800'),
  ('zero',           'Zero Sugar',       29, '#9aa0a6'),
  ('ultra-white',    'Ultra White',      31, '#d9dde3'),
  ('ultra-paradise', 'Ultra Paradise',   31, '#4cc9a4'),
  ('mango-loco',     'Mango Loco',       32, '#f5a300'),
  ('pipeline',       'Pipeline Punch',   32, '#e0457b');
