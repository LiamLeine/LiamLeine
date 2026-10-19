# Monster-bestilling

Nettside der elever logger inn, velger ukedager og smak for Monster, ser pris per smak og hvor mye de har brukt totalt. Frontend på GitHub Pages, brukere og data i Supabase.

## 1. Sett opp Supabase (gratis)
1. Opprett et prosjekt på [supabase.com](https://supabase.com).
2. Gå til **SQL Editor → New query**, lim inn hele `supabase.sql` og trykk **Run**. Det lager tabellene, sikkerhetsreglene og smakene.
3. Gå til **Project Settings → API** og kopier *Project URL* og *anon public key* inn i `config.js`.
4. **Authentication → Providers → Email:** Hvis du slår av *Confirm email*, kan elever logge inn med en gang. Ellers må de bekrefte via e-post først.
5. **Authentication → URL Configuration:** Sett *Site URL* til GitHub Pages-adressen din.

## 2. Legg ut på GitHub Pages
1. Last opp alle filene til et repo.
2. **Settings → Pages**, velg branch `main` og mappe `/ (root)`.
3. Siden er live på `https://BRUKERNAVN.github.io/REPONAVN/`.

## Sikkerhet
- `anon`-nøkkelen i `config.js` er offentlig av design. Det er sikkerhetsreglene (RLS) i `supabase.sql` som beskytter dataene: hver bruker ser bare sine egne bestillinger.
- Prisen settes av databasen, ikke av nettsiden, og gamle bestillinger kan ikke endres eller slettes. Bare fremtidige bestillinger kan avbestilles.
- Bruk aldri `service_role`-nøkkelen i frontend.

## Endre smaker og priser
Rediger tabellen `smaker` under **Table Editor** i Supabase. Eksisterende bestillinger beholder prisen de ble lagt inn med.

## Hvem betaler?
Siden registrerer bare bestillinger og forbruk. Selve betalingen og utleveringen må du ordne på andre måter.
