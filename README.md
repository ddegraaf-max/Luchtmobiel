# Business Club Luchtmobiel — Ledenplatform

Een besloten netwerk waar leden (en de brigade) **zelf** alles beheren: hun profiel, vacatures, ondersteuningsprojecten en de veteranenhub. Gebouwd met Node.js/Express, PostgreSQL en EJS — klaar voor Railway.

---

## Wat zit erin?

- **Ledengids** — elk lid een compleet profiel: foto, contactgegevens (met eigen keuze wat zichtbaar is), LinkedIn, **meerdere bedrijven** (elk met logo, functie, branche, website, e-mail, telefoon, adres, KvK en omschrijving; één hoofdbedrijf), expertise, "waarmee kan ik helpen / wat zoek ik" en band met Defensie. Doorzoekbaar op naam, bedrijf, expertise, branche en plaats.
- **Vacatures** — leden plaatsen en beheren zelf hun vacatures; markeer ze als "veteraanvriendelijk".
- **Ondersteuningsprojecten** — vraag steun (financieel, vrijwilligers, expertise…) en meld je aan bij projecten van anderen.
- **Veteranenzaken** — een hub met hulpbronnen en passend werk, beheerd door de brigade en het bestuur.
- **Partners & initiatieven** — publieke pagina met organisaties, stichtingen, sponsors en initiatieven (logo, omschrijving, website), gefilterd op categorie; uitgelichte partners staan ook op de homepage. Leden kunnen zelf een initiatief aandragen; dat komt als concept bij het bestuur/de brigade terecht om aan te vullen en te publiceren.
- **Sponsorverzoeken** — een assistent zoekt elke ochtend het Nederlandse web af naar sponsor-, donatie- en steunverzoeken voor militairen en veteranen. Alles komt eerst in een controlewachtrij; wat jij plaatst verschijnt op de publieke pagina *Sponsoring*. Zie [Sponsorverzoeken](#sponsorverzoeken-dagelijks-gezocht-door-de-assistent).
- **Zelfservice** — leden registreren met een toegangscode en beheren daarna alles zelf. Jij hoeft niets goed te keuren.
- **Beheer** — jij bepaalt rollen (lid / brigade / admin) en kunt leden activeren of verwijderen.
- **Veilig inloggen** — wachtwoord vergeten via e-mail, tweestapsverificatie met een authenticator-app (Google/Microsoft Authenticator, Authy, 1Password), herstelcodes, en bescherming tegen brute force en CSRF.

Afbeeldingen worden in de **database** opgeslagen (niet op schijf), zodat ze een Railway-deploy altijd overleven.

---

## Stap voor stap online zetten op Railway

### Stap 1 — Code op GitHub zet
1. Pak de ZIP uit op je computer.
2. Maak een nieuwe repository aan op GitHub (bijvoorbeeld `luchtmobiel-platform`).
3. Sleep met **GitHub Desktop** (of via de web-uploader) alle bestanden erin en push ze.
   - Let op: de map `node_modules` en het bestand `.env` horen er **niet** in (die staan al in `.gitignore`).

### Stap 2 — Project aanmaken op Railway
1. Ga naar [railway.app](https://railway.app) en kies **New Project → Deploy from GitHub repo**.
2. Selecteer je nieuwe repository. Railway herkent automatisch dat het een Node-app is.

### Stap 3 — Database toevoegen
1. Klik in je Railway-project op **New → Database → Add PostgreSQL**.
2. Railway maakt nu automatisch de variabele `DATABASE_URL` aan en koppelt die aan je app. (Je hoeft hier zelf niets in te vullen.)

### Stap 4 — Variabelen instellen
Ga naar je app-service → tabblad **Variables** en voeg toe:

| Variabele | Waarde |
|---|---|
| `SESSION_SECRET` | een lange, willekeurige tekst (verzin iets van 30+ tekens) |
| `ADMIN_EMAIL` | jouw e-mailadres (wordt het beheerdersaccount) |
| `ADMIN_PASSWORD` | een sterk wachtwoord voor jouw beheerdersaccount |
| `ADMIN_NAAM` | jouw naam, bijv. `Daniël de Graaf` |
| `REGISTRATIE_CODE` | de toegangscode voor nieuwe leden, bijv. `LUCHTMOBIEL` |
| `NODE_ENV` | `production` |
| `AGENDA_IMPORT_UREN` | (optioneel) om de hoeveel uur de agenda van bclmb.nl wordt overgenomen; standaard `6`, `0` = uit |
| `SPONSOR_IMPORT_UREN` | (optioneel) om de hoeveel uur de gevonden sponsorverzoeken van de assistent worden opgehaald; standaard `3`, `0` = uit |
| `TFA_VERPLICHT_ADMIN` | (optioneel) `1` = beheerders moeten eerst tweestapsverificatie instellen voordat ze bij Beheer kunnen |
| `APP_URL` | het adres van de site, bijv. `https://jouw-app.up.railway.app` (voor links in e-mails) |
| `ENCRYPTIE_SLEUTEL` | (aanbevolen) nog een lange willekeurige tekst; hiermee worden 2FA-geheimen versleuteld. Daarna **niet meer wijzigen** |
| `RESEND_API_KEY` | API-sleutel van [resend.com](https://resend.com) voor e-mail (welkomstmail, wachtwoord vergeten, meldingen) |
| `MAIL_VAN` | afzender, bijv. `BCLMB <noreply@bclmb.nl>` (domein in Resend verifiëren) |
| `MAIL_BESTUUR` | (optioneel) e-mailadres van het bestuur voor meldingen over nieuwe leden, vacatures en aanmeldingen |
| `SOCIAL_LINKEDIN` | (optioneel) link naar de LinkedIn-pagina van de club; verschijnt als icoon in de footer en op "Over het netwerk" |
| `SOCIAL_FACEBOOK` | (optioneel) link naar de Facebook-pagina |
| `SOCIAL_INSTAGRAM` | (optioneel) link naar het Instagram-account |
| `TURNSTILE_SITE_KEY` | (optioneel) site-sleutel van je Cloudflare Turnstile-widget (robot-controle), zie hieronder |
| `TURNSTILE_SECRET_KEY` | (optioneel) geheime sleutel van dezelfde Turnstile-widget |

> `DATABASE_URL` staat er al door stap 3 — die laat je met rust.
>
> **Let op:** `SESSION_SECRET` en `ENCRYPTIE_SLEUTEL` zijn geheimen. Wijzig je `ENCRYPTIE_SLEUTEL` (of `SESSION_SECRET` als je geen aparte encryptiesleutel hebt), dan werken de authenticator-apps van leden niet meer en moeten zij met een herstelcode inloggen of door jou gereset worden.

### Stap 5 — Starten en openen
1. Railway bouwt en start de app automatisch (`npm start`).
2. Bij de eerste start worden alle tabellen aangemaakt en wordt jouw adminaccount klaargezet.
3. Onder **Settings → Networking** klik je op **Generate Domain** om een webadres te krijgen.
4. Open dat adres. Log in met je `ADMIN_EMAIL` en `ADMIN_PASSWORD`.

> **Poort:** de app luistert automatisch op de poort die Railway aangeeft (`PORT`). Je hoeft hier niets in te stellen. Mocht Railway om een "Target Port" vragen, vul dan dezelfde poort in als in de logs staat (meestal hoeft dit niet).

---

## Hoe het werkt voor de leden

1. Een lid gaat naar **Word lid**, vult zijn gegevens in met de **toegangscode** die jij hebt gedeeld.
2. Daarna kan hij/zij meteen het profiel aanvullen, vacatures plaatsen en projecten delen.
3. Jij keurt niets goed — leden doen alles zelf. Wil je iemand toch tegenhouden? Zet het account in **Beheer** op inactief.

### Rollen
- **Lid** — standaard. Beheert eigen profiel, vacatures en projecten.
- **Brigade** — krijgt een herkenbaar kenmerk én mag de veteranenhub, de agenda, het nieuws, de galerij en de partnerpagina beheren.
- **Admin** — volledige toegang, inclusief het beheerpaneel. (Dat ben jij.)

Je wijzigt rollen via **Beheer** (alleen zichtbaar voor admins).

---

## Officiële regimentsemblemen toevoegen
Op de pagina **De Brigade** staan bij de drie eenheden voorlopige, zelf-ontworpen emblemen. Wil je de échte regimentsemblemen tonen, dan plaats je drie afbeeldingen met deze exacte namen in de map `public/img/`:

| Eenheid | Bestandsnaam |
|---|---|
| Garde Grenadiers en Jagers | `embleem-grenadiers.png` |
| Regiment Van Heutsz | `embleem-vanheutsz.png` |
| Regiment Stoottroepen Prins Bernhard | `embleem-stoottroepen.png` |

Gebruik bij voorkeur een PNG met transparante achtergrond (vierkant, bijv. 300×300 px). Zodra de bestanden er staan en je opnieuw deployt, verschijnen ze automatisch in plaats van de voorlopige ontwerpen.

> **Belangrijk over rechten:** de officiële emblemen zijn beschermd beeldmateriaal van Defensie. Vraag het juiste, gelicentieerde beeld en toestemming op bij het regiment / de traditiecommissie, bij 11 Luchtmobiele Brigade of via het Mediacentrum Defensie. Als aan de brigade verbonden businessclub heb je daar doorgaans korte lijnen voor.

## Agenda automatisch gevuld vanaf bclmb.nl
De activiteiten op de hoofdsite van de Business Club ([bclmb.nl/evenementen](https://bclmb.nl/evenementen)) worden automatisch in de agenda van het platform gezet: bij het starten en daarna elke 6 uur (instelbaar met `AGENDA_IMPORT_UREN`; `0` zet het uit). In **Beheer** zie je wanneer de laatste import draaide en kun je met **Nu importeren** direct bijwerken.

- Titel, omschrijving, datum/tijd, locatie en afbeelding komen van bclmb.nl (iCal-feed + de evenementpagina). Wijzigt er iets op de hoofdsite, dan wordt het hier bijgewerkt.
- Geïmporteerde evenementen verwijzen voor het aanmelden naar bclmb.nl (knop *Aanmelden op bclmb.nl*), zodat er één deelnemerslijst is. Wil je toch aanmelden via het platform? Zet dan in het evenement *Aanmelden mogelijk maken* aan; die instelling (en de categorie en het maximum aantal plaatsen) wordt niet overschreven.
- Verwijder je een geïmporteerd evenement in het platform, dan wordt het niet opnieuw geïmporteerd (terug te draaien in Beheer). Verdwijnt een toekomstig evenement van de hoofdsite, dan verdwijnt het hier ook, tenzij er al aanmeldingen zijn.
- Evenementen zonder tijd worden als "hele dag" getoond; dat kun je ook voor handmatige evenementen aanvinken.

> Bij de eerste import komen de echte activiteiten naast eventuele oude voorbeeld-evenementen te staan. Verwijder de voorbeelden (of dubbele handmatige versies) één keer via de agenda.

## Sponsorverzoeken: dagelijks gezocht door de assistent
Op de publieke pagina **Sponsoring** (`/sponsorverzoeken`) staan sponsor-, donatie- en steunverzoeken voor militairen en veteranen in Nederland. Zo komen ze daar:

1. **Zoeken (elke ochtend, automatisch).** Een Claude-routine in de cloud zoekt rond 7 uur het Nederlandstalige web af (crowdfunding-platforms, stichtingen, nieuws) naar nieuwe verzoeken: sponsorlopen, benefietacties, hulphonden, Invictus-deelname, monumenten, reünies, stichtingen die sponsors zoeken, enzovoort. Ze controleert elke vondst op de pagina zelf, vat hem neutraal samen en zet hem in de repository op de tak `claude/sponsor-inbox` in `data/sponsorverzoeken.json`. De werkinstructie van de routine staat in [docs/sponsor-assistent.md](docs/sponsor-assistent.md); pas die aan als je andere zoektermen of bronnen wilt.
2. **Ophalen.** Het platform haalt die lijst elke 3 uur op (`SPONSOR_IMPORT_UREN`) en zet alleen nog onbekende verzoeken in de controlewachtrij. Is `MAIL_BESTUUR` ingesteld, dan krijg je een e-mail zodra er iets nieuws is.
3. **Controle.** Onder **Sponsoring → Controle** (ook via **Beheer**) zie je alles wat wacht. Klik op *Bekijk de bron*, pas eventueel de tekst aan met *Bewerken* en kies **Plaatsen** of **Afwijzen**. Afgewezen verzoeken worden nooit opnieuw aangeboden; geplaatste kun je later weer van de site halen of uitlichten (bovenaan tonen).
4. **Handmatig.** Kom je zelf een verzoek tegen? Voeg het toe via **+ Handmatig toevoegen**.

De routine beheer je op [claude.ai/code/routines](https://claude.ai/code/routines) (aan/uit zetten, tijdstip wijzigen, direct laten draaien, logboek bekijken). Draait de routine niet, dan blijft de site gewoon werken; er komen alleen geen nieuwe verzoeken binnen. Met **Nu ophalen** haal je de lijst direct op zonder op het volgende interval te wachten.

## Beveiliging: wachtwoord vergeten & tweestapsverificatie

### Wachtwoord vergeten
Op de inlogpagina staat **Wachtwoord vergeten?**. Een lid vult zijn e-mailadres in en krijgt een link die 1 uur geldig is en één keer werkt. Hiervoor moet e-mail zijn ingesteld (`RESEND_API_KEY` en bij voorkeur `APP_URL`). Zonder e-mailinstelling ziet het lid een melding om contact op te nemen met het bestuur.

### Tweestapsverificatie (authenticator-app)
Elk lid kan onder **Mijn profiel → Beveiliging** een authenticator-app koppelen:
1. Wachtwoord bevestigen, QR-code scannen met de app, code invoeren.
2. Het lid krijgt **8 herstelcodes** te zien (eenmalig). Daarmee kan het lid inloggen als de telefoon kwijt is.
3. Bij het inloggen wordt na het wachtwoord om de 6-cijferige code gevraagd.

Is een lid zowel de telefoon als de herstelcodes kwijt? Dan klik je in **Beheer** bij dat lid op **Reset** (kolom 2FA). Het lid krijgt hiervan een e-mail en kan daarna opnieuw een authenticator instellen.

Doe dit als beheerder ook zelf: jouw account heeft de meeste rechten.

### Robot-controle (Cloudflare Turnstile)
Op de formulieren **Inloggen**, **Word lid** en **Wachtwoord vergeten** kan een Turnstile-widget staan: een lichte, gratis "ben je geen robot"-controle van Cloudflare (geen plaatjes aanklikken). Zo instellen:
1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → **Add widget**.
2. Geef een naam, vul bij *Hostname* het domein van de site in (bijv. `jouw-app.up.railway.app` of je eigen domein) en kies widget-type **Managed**.
3. Kopieer de **Site Key** en **Secret Key** naar Railway → Variables als `TURNSTILE_SITE_KEY` en `TURNSTILE_SECRET_KEY`.
4. Railway herstart de app; de widget verschijnt automatisch boven de knop van de drie formulieren.

Laat je beide variabelen leeg, dan is er geen robot-controle. Werkt inloggen na het instellen niet meer (melding "robot-controle is mislukt")? Controleer dan of de sleutels kloppen en of het domein in Cloudflare juist is — of haal de twee variabelen weg om de controle uit te zetten.

### Wat er verder is beveiligd
- Wachtwoorden met bcrypt (12 rondes); 2FA-geheimen versleuteld (AES-256-GCM); van herstelcodes en herstellinks alleen een hash in de database.
- Bescherming tegen brute force (limiet op inlog-, registratie-, herstel- en 2FA-pogingen) en tegen bots (Turnstile).
- CSRF-tokens op alle formulieren, veilige HTTP-headers (CSP zonder inline scripts, HSTS, nosniff, geen framing, COOP/CORP), https afgedwongen in productie.
- Nieuwe sessie-id bij inloggen; bij wachtwoordwijziging of -herstel worden andere apparaten uitgelogd; deactiveren door de beheerder werkt direct; wijzigen van het inlog-e-mailadres vraagt het wachtwoord.
- Geüploade afbeeldingen worden op inhoud gecontroleerd (alleen echte JPG/PNG/WebP/GIF, geen SVG) en gesandboxt geserveerd; profielfoto's en bedrijfslogo's zijn alleen zichtbaar voor ingelogde leden.
- Alle invoer is begrensd (lengte, aantal velden, bestandsgrootte); route-id's worden gevalideerd; fouten tonen nooit technische details.
- De agenda-import haalt alleen publieke http(s)-adressen op (geen interne netwerken) met een maximale grootte en time-out.
- Met `TFA_VERPLICHT_ADMIN=1` kan een beheerder het beheerpaneel pas gebruiken na het instellen van tweestapsverificatie.

Bewuste keuzes die je moet weten: afbeeldingen van openbare onderdelen (partners, projecten, evenementen, galerij) zijn via hun adres ook zonder inloggen op te vragen; bij registratie is te zien of een e-mailadres al bestaat (nodig voor een duidelijke melding, beperkt door de toegangscode en de limiet op pogingen); e-mail wijzigen wordt niet met een bevestigingslink geverifieerd (wel per mail gemeld op het oude en nieuwe adres).

## De toegangscode aanpassen
Wil je de code wijzigen (bijv. na een nieuwe ledenwerving)? Pas de variabele `REGISTRATIE_CODE` op Railway aan en de app gebruikt direct de nieuwe code.
Laat je `REGISTRATIE_CODE` helemaal leeg, dan mag iedereen zonder code registreren.

---

## Lokaal draaien (optioneel, voor ontwikkelaars)
1. Zorg dat PostgreSQL lokaal draait.
2. Kopieer `.env.example` naar `.env` en vul de waarden in.
3. `npm install`
4. `npm start` → open http://localhost:3000
5. `npm test` draait de unit-tests.

---

## Techniek in het kort
- **Node.js + Express** met **EJS**-templates.
- **PostgreSQL** voor alle data; sessies en afbeeldingen staan óók in de database (deploy-bestendig).
- Wachtwoorden veilig opgeslagen met **bcrypt**; tweestapsverificatie (TOTP, RFC 6238) zonder externe dienst.
- Tests: `npm test` (TOTP-testvectoren, versleuteling, herstelcodes, uploads).
- `trust proxy` + veilige cookies in productie (voorkomt https/cookie-problemen op Railway).
