# CLAUDE.md

**Krachtbal Tekenclub** — samen live tekenen voor kinderen (krachtbal-thema).
Lees `README.md` voor de architectuur. Taal van UI, comments, commits en docs:
**Nederlands**.

- `npm test` na elke wijziging (unit + integratie met een echte server).
- Geen build-stap: `public/js/*` zijn ES-modules die rechtstreeks geladen worden.
- `public/js/shared.js` draait in de browser én op de server: geen DOM/Node-API's.
- Nieuwe sticker: id toevoegen in `STICKERS` (shared.js) + SVG en label in
  `stickers.js`; de server weigert onbekende ids.
- Tekenen moet deterministisch blijven (`render.js`): gebruik de seed (`sd`),
  nooit `Math.random()` bij het renderen.
- De server stuurt nooit HTML door die van gebruikers komt; namen/tekst worden
  opgekuist en in de browser enkel via `textContent`/canvas getoond.
- Krachtbal-info (balkleuren, veldmaten, logo's) komt uit de repo
  `lenzielenz/Livescore-Krachtbal` (`KRACHTBAL-REGLEMENT.md`, `KrachtbalIcon.tsx`).
