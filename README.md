# Krachtbal Tekenclub ✏️⚡

Samen live tekenen op één oneindig groot blad, voor kinderen. Je logt in met een
naam en een dier, kiest een ruimte en tekent mee. Iedereen in dezelfde ruimte
ziet elkaars lijnen live verschijnen, ziet de cursors van de anderen en kan
reageren met 👏 🎉 🔥. Een ruimte blijft bewaard, ook als iedereen weg is.

Later gaat dit naar de website van Krachtbal Live (zie onderaan).

## Wat kan je allemaal?

**Samen tekenen**
- Wie meetekent, zie je meteen: aan het puntje van elke lijn die iemand nu
  tekent hangt een naamlabel (**"🐨 Mats tekent…"**), dat nog even blijft
  staan als de lijn af is ("🐨 Mats ✓").
- Tekent iemand buiten jouw beeld? Dan verschijnt aan de rand een rondje met
  zijn/haar dier en een pijltje. Tik erop en je vliegt ernaartoe.
- In de bovenbalk wiebelt het dier van wie aan het tekenen is (met ✏️).
- **💡 Tekenuitdaging** voor de hele ruimte: iedereen krijgt dezelfde opdracht
  (30 ideeën, van heel makkelijk tot pittig) met een timer van 90 seconden, en
  op het einde confetti en zoomt iedereen uit om alles te bekijken.
- **🏅 Medailles** verzamelen (16 stuks, bv. Glitterfee, Spiegelmeester,
  Teamspeler, Ballenkenner). Ze staan enkel op het eigen toestel: geen
  ranglijst, geen wedstrijd tussen kinderen.

**Extra voor de jongsten (en de ouderen)**
- **🔷 Vormen**: cirkel, vierkant, driehoek, ster, hart, rechte lijn — slepen
  of gewoon tikken. Optioneel opgevuld met het gekozen patroon.
- **🦋 Spiegeltekenen**: vlinder (links/rechts), vier hoeken of caleidoscoop
  (zes keer rondom). Eén keer ongedaan maken haalt alle kopieën weg.
- **💎 Glitter**-penseel.
- **🖍️ Kleurplaten**: krachtbal, speler, beker, trui, leeuw-mascotte en veld.
  De lijnen blijven altijd bovenaan, dus je kan eronder inkleuren.

**Gereedschap**
- **Penselen**: potlood, stift, neon, regenboog, glitter, spray en de **ballen-borstel**
  (een spoor van krachtballen in de vijf officiële kleuren).
- **Vullen**: teken een rondje en het wordt opgevuld met effen, dambord,
  bolletjes, strepen of krachtballen.
- **Stickers**: de 5 krachtballen (800 g oranje, 1 kg geel, 2 kg rood,
  3 kg blauw, 4 kg wit), het Krachtbal Live-logo, het Sint-Michiels-clubwapen,
  krachtbalveld, beker, medaille, scheidsrechtersfluit, truien, "DOELPUNT!",
  krachtschot, scorebord, speler, wimpel, supportersbord… en emoji.
- **Tekst**, **gom** (enkel je eigen tekening — kinderen kunnen elkaars werk
  niet wissen), **ongedaan maken / opnieuw**.
- **Oneindig zoomen** (1 % tot 800 %): knijpen met twee vingers, scrollen,
  of de ➖/➕-knoppen. Tik op het percentage om alles in beeld te krijgen.
- **Achtergronden**: krachtbalveld op ware grootte (46 × 14 m, doelgebieden,
  vrijeworplijnen), wit blad, ruitjes, sterrennacht.
- 💡 tekenidee, 📷 foto van je tekening, volledig scherm, knoppen verbergen,
  geluidjes aan/uit.
- **Apple Pencil**: zodra een pen gebruikt wordt, tekent enkel de pen en
  schuift je hand het blad (handpalm wordt genegeerd).
- **Wifi weg?** Wat je tekent wordt bijgehouden en verstuurd zodra de
  verbinding terug is.
- De lobby toont per ruimte een foto van de tekening en wie er **LIVE** tekent.

## Starten

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # met automatisch herstarten
npm test           # unit- + integratietests
```

Node ≥ 20. Enige dependency: `ws`.

### Omgeving

| Variabele | Betekenis |
| --- | --- |
| `PORT` | poort (standaard 3000) |
| `DATA_DIR` | map voor de tekeningen (standaard `./data`; op Railway automatisch het volume via `RAILWAY_VOLUME_MOUNT_PATH`) |
| `ADMIN_PIN` | zet je dit, dan kan je een ruimte leegmaken/verwijderen: `curl -X POST -H "x-admin-pin: …" /api/rooms/<id>/clear` (of `/delete`) |

Op **Railway**: koppel een Volume (anders zijn tekeningen weg na een deploy).
`railway.json` start met `npm start` en gebruikt `/health` als healthcheck.

## Hoe het werkt

```
tablet ──WebSocket /ws──► server ──► alle andere tablets in dezelfde ruimte
   live lijn (elke 40 ms)          (doorsturen, niet bewaren)
   afgewerkt item ("add")          valideren → logboek op schijf → doorsturen
```

- **`server/index.js`** — statische bestanden, lobby-API (`/api/rooms`) en de
  WebSocket. Per verbinding een spamrem (token bucket); de eigenaar van een
  tekening is een hash van een geheim dat enkel het toestel kent.
- **`server/store.js`** — per ruimte een append-only logboek (NDJSON) met
  "toegevoegd"/"verwijderd"-events; de tekening wordt daaruit afgeleid (zelfde
  idee als de worp-events in Krachtbal Live). Wordt bij het laden gecompacteerd.
- **`public/js/shared.js`** — gedeelde constanten + `sanitizeItem` (validatie),
  gebruikt door server én browser.
- **`public/js/board.js`** — het canvas: camera, tools, live lijnen, cursors,
  undo. Twee lagen: de basislaag tekent enkel opnieuw als er iets verandert;
  tijdens schuiven in een héél volle ruimte toont hij een verschoven kopie.
- **`public/js/render.js`** — deterministisch tekenen van items en
  achtergronden (spray en regenboog zien er op elk toestel identiek uit).
- **`public/js/stickers.js`** — alle stickers als SVG in code; de krachtbal is
  dezelfde tekening als het `KrachtbalIcon` van Krachtbal Live.

### Items

| `k` | soort | velden |
| --- | --- | --- |
| `s` | lijn | `b` penseel, `c` kleur, `w` dikte, `sd` seed, `p` punten |
| `f` | vulvorm | `pat` patroon, `c`, `sc` patroongrootte, `p` |
| `k` | sticker | `s` id (of `e:` + emoji), `x`, `y`, `z` grootte, `r` draaiing |
| `t` | tekst | `v`, `c`, `x`, `y`, `z` |

Coördinaten zijn wereld-eenheden; op het krachtbalveld is 1 m = 100.

## Naar Krachtbal Live

De frontend is framework-loos (ES-modules, geen build). Twee opties:

1. **Als aparte Railway-service** naast de livescore en linken/embedden
   (`/r/<ruimte>` is een directe link naar een ruimte).
2. **Inbouwen in de Next.js-app**: `public/js/*` als client-component laden,
   de WebSocket-server als losse service houden (Next/Railway route handlers
   doen geen WebSockets), of de live-laag ombouwen naar de bestaande
   `sse-hub` + POST-acties. Naam/dier kan dan uit het bestaande profiel komen.
