# Werkinstructie: dagelijkse zoekronde sponsorverzoeken

Deze instructie is voor de Claude-routine die elke ochtend het Nederlandse web afzoekt naar
sponsor-, donatie- en steunverzoeken voor militairen en veteranen, en de vondsten klaarzet
voor controle door het bestuur van de Business Club Luchtmobiel. De routine leest dit bestand
aan het begin van elke ronde; wat hier staat gaat voor op de korte opdracht in de routine zelf.

## Doel

Nieuwe, **Nederlandstalige** verzoeken vinden waarin geld, goederen, diensten of sponsors
worden gevraagd **voor of door Nederlandse militairen, veteranen of hun nabestaanden**. Denk aan:

- crowdfunding- en doneeracties (Doneeractie.nl, GoFundMe, WhyDonate, Geef.nl, Steunactie, Kentaa/Digicollect, …) voor een veteraan of militair (hulphond, therapie, deelname Invictus Games, aanpassingen aan huis, reünie, monument, herdenking);
- sponsorlopen, wandel-, fiets- en sportevenementen waarvan de opbrengst naar veteranen of militairen gaat en waar deelnemers of sponsors voor worden gezocht;
- stichtingen en verenigingen voor veteranen of militairen die expliciet sponsors, donateurs of partners zoeken (bijv. voor een veteranencafé, inloophuis, herdenkingsreis, veteranendag, jubileumboek);
- benefietconcerten, veilingen, diners en collectes met dat doel;
- oproepen van eenheden, veteranenverenigingen of regimenten om een activiteit of monument te bekostigen.

**Niet** opnemen:

- nieuwsberichten zonder concreet verzoek (bijv. "sponsor X steunt veteranen" — dat is verslaggeving, geen verzoek);
- acties die al zijn afgelopen of het doel al hebben bereikt;
- commerciële advertenties, vacatures, politieke campagnes, petities;
- verzoeken uit België of andere landen (tenzij het overduidelijk om Nederlandse militairen of veteranen gaat);
- Engelstalige of anderstalige pagina's;
- alles wat je niet zelf op de pagina hebt kunnen controleren.

## Stap voor stap

1. **Haal de huidige lijst op.** De werkkopie in de omgeving kan verouderd zijn; haal daarom altijd eerst alles vers op en werk vanaf de remote-takken:
   ```bash
   git fetch origin
   git checkout -B claude/sponsor-inbox origin/claude/sponsor-inbox 2>/dev/null || git checkout -B claude/sponsor-inbox origin/main
   git show origin/main:data/sponsorverzoeken.json   # startlijst/handmatige aanvullingen van het bestuur
   ```
   Lees `data/sponsorverzoeken.json` op de tak én de versie op `origin/main` (bovenstaande `git show`). Alle `url`'s en `id`'s die in een van beide staan zijn al bekend: die hoef je niet opnieuw op te voeren. Het platform leest beide bestanden en voegt ze samen, dus je hoeft niets van `main` over te nemen. (Bestaat het bestand nog niet, maak het dan aan met `{"bijgewerkt": null, "items": []}`.)

2. **Zoek.** Gebruik WebSearch met Nederlandse zoektermen. Zoek breed; combineer termen en varieer per ronde. Voorbeelden (voeg waar zinvol de huidige maand of het jaar toe):
   - `veteranen sponsor gezocht`, `veteraan sponsoring`, `sponsorloop veteranen`, `sponsoractie veteranen`
   - `militairen sponsor gezocht`, `sponsoring militairen`, `defensie benefiet`
   - `doneeractie veteraan`, `crowdfunding veteraan`, `geld inzamelen veteraan`, `steun veteraan hulphond`
   - `veteranen stichting donateurs gezocht`, `veteranencafé sponsor`, `veteranen inloophuis sponsoring`
   - `Invictus Games Nederland sponsor`, `Team Nederland Invictus donatie`
   - `veteranen monument geld nodig`, `herdenking veteranen financiering`, `reünie veteranen sponsor`
   - `nabestaanden militairen actie doneren`, `benefietconcert veteranen`, `veiling veteranen goed doel`
   - `site:doneeractie.nl veteraan`, `site:doneeractie.nl militair`, `site:gofundme.com veteraan`, `site:whydonate.com veteraan`, `site:geef.nl veteranen`, `site:steunactie.nl veteraan`
   Gebruik ook termen die organisaties zélf gebruiken in plaats van "veteraan": `frontliner`, `frontliners sponsormars`, `marsathon militairen`, `hulpverleners en militairen PTSS actie`, `oud-militair PTSS actie steun`, `Airborne mars sponsor veteranen`, `Invictus deelnemer sponsor`, `veteranen motorrit goed doel`, `veteranendag sponsors gezocht`.

   **Vaste bronnen — bekijk deze elke ronde met WebFetch** (kleine stichtingen komen zelden hoog in zoekresultaten):
   - https://deonzichtbarefrontliner.nl/events/ (Stichting De Onzichtbare Frontliner: jaarlijkse Frontlinermarch in september)
   - https://www.actievoorhelden.nl/evenementen/ en https://www.hulpvoorhelden.nl/ (Hulp voor Helden)
   - https://steun.veteranensearchteam.nl/ (Veteranen Search Team)
   - https://www.nlveteraneninstituut.nl/checkpoint-veteranen/prikbord-online/ (prikbord van het Veteraneninstituut)
   - https://www.veteranendag.nl/ (nieuws rond de Nederlandse Veteranendag)
   - https://www.geef.nl/nl/zoeken?q=veteranen en https://steunactie.nl/zoeken?q=veteraan (crowdfunding-platforms)
   Het bestuur kan deze lijst aanvullen; nieuwe bronnen die het bestuur noemt, voeg je hier toe.

   Zoek ook naar **openbare berichten op sociale media**, waar veel sponsorverzoeken beginnen:
   `site:linkedin.com/posts veteranen sponsor`, `site:linkedin.com/posts veteraan sponsoring gezocht`, `site:linkedin.com/posts militairen benefiet`, `site:linkedin.com/pulse veteranen sponsor`, `site:facebook.com veteranen sponsoractie`, `site:facebook.com veteraan doneeractie`.
   Let op: LinkedIn en Facebook laten pagina's vaak niet openen zonder inlog. Verwijst het bericht naar een actiepagina (doneeractie, GoFundMe, website van een stichting), gebruik dan díe pagina als `url` en controleer die. Is er alleen het bericht zelf en kun je het niet openen, neem het dan alleen op als de tekst in de zoekresultaten ondubbelzinnig een lopend Nederlands verzoek voor militairen/veteranen toont, met de link naar het bericht als `url`, `bron_naam` `linkedin.com` of `facebook.com`, en eindig de `samenvatting` met "Nog niet op de pagina gecontroleerd."
   Kijk ook rechtstreeks (met WebFetch) op zoekpagina's van crowdfunding-platforms, bijv. `https://www.doneeractie.nl/zoeken?q=veteraan` en `https://www.doneeractie.nl/zoeken?q=militair`, en op nieuwspagina's van veteranenorganisaties (Nederlands Veteraneninstituut, vfonds, Nederlandse Veteranendag, veteranenverenigingen van de regimenten van 11 Luchtmobiele Brigade).

3. **Controleer elke kandidaat op de pagina zelf** met WebFetch. Neem alleen op wat aan de criteria hierboven voldoet en waarvan de actie nog loopt. Haal uit de pagina: titel, organisatie of initiatiefnemer, voor wie het is, plaats/regio, doelbedrag en einddatum (als vermeld), en de datum waarop het verzoek is geplaatst (als vermeld).

4. **Schrijf per verzoek een neutrale samenvatting** van één of twee zinnen (max. 300 tekens) in het Nederlands: wat wordt gevraagd en waarvoor. Eventueel een langere toelichting van een paar alinea's in `omschrijving` (max. 5000 tekens). Geen wervende taal, geen eigen mening, niets verzinnen: wat niet op de pagina staat, laat je leeg (`null`).

5. **Werk `data/sponsorverzoeken.json` bij.**
   - Voeg nieuwe verzoeken toe aan `items` (nieuwe bovenaan). Sla alles over waarvan de `url` (ook zonder `www.`, slash aan het eind of `utm_`-parameters) al in de lijst staat.
   - Maximaal **15 nieuwe verzoeken per ronde**; kies bij meer kandidaten de meest concrete en actuele.
   - Verwijder items waarvan `gevonden_op` ouder is dan 90 dagen (de site heeft ze dan allang overgenomen).
   - Zet `bijgewerkt` op het huidige tijdstip (ISO 8601, UTC), ook als er niets nieuws is.
   - Controleer dat het bestand geldige JSON is (`node -e "JSON.parse(require('fs').readFileSync('data/sponsorverzoeken.json','utf8'))"`).

6. **Commit en push naar de tak `claude/sponsor-inbox`.**
   ```bash
   git add data/sponsorverzoeken.json
   git commit -m "Sponsorverzoeken: zoekronde $(date -u +%Y-%m-%d) — N nieuw"
   git push origin claude/sponsor-inbox
   ```
   Maak **geen** pull request en wijzig **niets** op `main` of in andere bestanden. De site haalt de lijst zelf op van
   `https://raw.githubusercontent.com/ddegraaf-max/Luchtmobiel/claude/sponsor-inbox/data/sponsorverzoeken.json`.

7. **Sluit af met een kort verslag** (in het Nederlands): welke zoektermen je hebt gebruikt, hoeveel kandidaten je zag, welke je hebt toegevoegd (titel + url) en welke je hebt afgewezen en waarom. Is er niets nieuws, zeg dat dan gewoon.

## Als iets niet werkt

- **WebFetch geeft `EGRESS_BLOCKED`** (de omgeving mag geen externe sites openen). Dan kun je kandidaten niet op de pagina controleren. Neem in dat geval **alleen** kandidaten op waarvan titel én zoekresultaat-tekst ondubbelzinnig een lopend Nederlands sponsor- of donatieverzoek voor militairen/veteranen tonen (bijv. een actiepagina op doneeractie.nl, steunactie.nl, whydonate.com, gofundme.com, geef.nl), laat onbekende velden op `null`, en eindig de `samenvatting` met de zin "Nog niet op de pagina gecontroleerd." Het bestuur controleert vóór plaatsing toch alles zelf. Meld in je verslag dat WebFetch geblokkeerd was, zodat het bestuur de netwerktoegang van de omgeving kan aanpassen (claude.ai → Code → Environments → *Default* → netwerktoegang).
- **Eén site weigert (HTTP 403 of 503) terwijl andere sites wel werken** — doneeractie.nl doet dit bijvoorbeeld bij geautomatiseerde bezoekers. Behandel alleen die kandidaat zoals hierboven (opnemen als de zoekresultaat-tekst ondubbelzinnig is, met "Nog niet op de pagina gecontroleerd."); de rest van de ronde gaat gewoon door.
- **`git push` wordt geweigerd** met "Claude doesn't have GitHub access": de Claude GitHub App is niet (meer) gekoppeld aan de repository. Probeer niets anders (geen pull request, geen omwegen); zet de volledige lijst met gevonden verzoeken in je verslag, zodat ze niet verloren gaan, en vermeld dat het bestuur de app moet koppelen via https://github.com/apps/claude/installations/select_target (repository `ddegraaf-max/Luchtmobiel`).

## Formaat van `data/sponsorverzoeken.json`

```json
{
  "bijgewerkt": "2026-08-31T05:12:00Z",
  "items": [
    {
      "id": "doneeractie-12345",
      "titel": "Hulphond voor veteraan Mark",
      "organisatie": "Familie De Vries",
      "doelgroep": "Veteranen",
      "samenvatting": "Inzamelactie voor de opleiding van een PTSS-hulphond voor een Afghanistan-veteraan uit Ede; het doel is € 12.500.",
      "omschrijving": null,
      "url": "https://www.doneeractie.nl/hulphond-voor-veteraan-mark/-12345",
      "bron_naam": "doneeractie.nl",
      "plaats": "Ede",
      "doelbedrag": "€ 12.500",
      "einddatum": "2026-12-31",
      "gepubliceerd_op_bron": "2026-08-28",
      "gevonden_op": "2026-08-31",
      "zoekterm": "doneeractie veteraan hulphond"
    }
  ]
}
```

Velden:

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | Stabiel kenmerk, bijv. platform + nummer of een korte slug. Nooit hergebruiken voor een ander verzoek. |
| `titel` | ja | Titel van het verzoek (max. 200 tekens). |
| `url` | ja | Directe link naar het verzoek (https). Geen zoekpagina's of homepages. |
| `organisatie` | nee | Stichting, vereniging of initiatiefnemer. |
| `doelgroep` | nee | Een van: `Veteranen`, `Militairen`, `Militairen & veteranen`, `Nabestaanden & gezinnen`, `Overig`. |
| `samenvatting` | nee | Neutrale samenvatting, max. 300 tekens. |
| `omschrijving` | nee | Langere toelichting, alinea's gescheiden door een lege regel, max. 5000 tekens. |
| `bron_naam` | nee | Domein van de bron (bijv. `doneeractie.nl`). Wordt anders uit de url afgeleid. |
| `plaats` | nee | Plaats of regio. |
| `doelbedrag` | nee | Zoals op de pagina vermeld, bijv. `€ 5.000`. |
| `einddatum` | nee | `JJJJ-MM-DD`, alleen als de pagina een einddatum noemt. |
| `gepubliceerd_op_bron` | nee | Datum waarop het verzoek online kwam, `JJJJ-MM-DD` of ISO-tijdstip. |
| `gevonden_op` | ja | Datum van deze zoekronde, `JJJJ-MM-DD`. |
| `zoekterm` | nee | De zoekopdracht waarmee je het vond (helpt het bestuur de zoekstrategie te verbeteren). |

Het platform valideert elk item opnieuw, negeert ongeldige items en slaat alles over wat het al kent
(zelfde url, zelfde `id` of dezelfde titel van dezelfde site). Wat het bestuur afwijst, komt niet
terug — ook niet als het in dit bestand blijft staan.
