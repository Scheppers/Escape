# Chemie Escape Room – opgeschoonde GitHub-versie

## Wat is verwijderd?
De volledige map `dist/` is uit de bronversie verwijderd, omdat de inhoud duplicaten van de hoofdmap en `assets/` bevat. De `.gitignore` voorkomt dat deze gegenereerde bestanden opnieuw in GitHub terechtkomen.

## Netlify
De bestaande `netlify.toml` gebruikt:
- Build command: `node scripts/build.mjs`
- Publish directory: `dist`

Netlify maakt bij elke deployment automatisch een nieuwe `dist/` aan. Laat de instellingen zo staan.

## Zelf controleren
Voer in de projecthoofdmap `node scripts/build.mjs` uit. Daarmee worden de gepubliceerde bestanden opnieuw aangemaakt. Controleer de website daarna in Netlify.

## Let op
- De originele `assets/` blijven volledig behouden.
- Alle Supabase-SQL-migraties en Netlify-functies blijven behouden.
- De oude installatie-/update-notities blijven voorlopig bewaard; ze kunnen later naar een archief.
- `mono-games.js` en `synth-lab.js` zijn in deze versie niet direct in `index.html` geladen. Ze zijn bewust niet verwijderd zonder functionele controle.
- Bewaar geheime sleutels uitsluitend in Netlify-/Supabase-omgevingsvariabelen, niet in GitHub.

## GitHub uploaden
Upload de inhoud van `Escape-main/` als projectroot, niet de omvattende map. Verwijder de bestaande `dist/` ook uit de GitHub-repository (een `.gitignore` alleen verwijdert reeds gevolgde bestanden niet).
