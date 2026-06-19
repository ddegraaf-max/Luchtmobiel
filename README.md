# Business Club Luchtmobiel — Ledenplatform

Een besloten netwerk waar leden (en de brigade) **zelf** alles beheren: hun profiel, vacatures, ondersteuningsprojecten en de veteranenhub. Gebouwd met Node.js/Express, PostgreSQL en EJS — klaar voor Railway.

---

## Wat zit erin?

- **Ledengids** — elk lid een eigen profiel met logo, bedrijf, expertise, website en contact. Doorzoekbaar op branche.
- **Vacatures** — leden plaatsen en beheren zelf hun vacatures; markeer ze als "veteraanvriendelijk".
- **Ondersteuningsprojecten** — vraag steun (financieel, vrijwilligers, expertise…) en meld je aan bij projecten van anderen.
- **Veteranenzaken** — een hub met hulpbronnen en passend werk, beheerd door de brigade en het bestuur.
- **Zelfservice** — leden registreren met een toegangscode en beheren daarna alles zelf. Jij hoeft niets goed te keuren.
- **Beheer** — jij bepaalt rollen (lid / brigade / admin) en kunt leden activeren of verwijderen.

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

> `DATABASE_URL` staat er al door stap 3 — die laat je met rust.

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
- **Brigade** — krijgt een herkenbaar kenmerk én mag de veteranenhub vullen met hulpbronnen.
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

## De toegangscode aanpassen
Wil je de code wijzigen (bijv. na een nieuwe ledenwerving)? Pas de variabele `REGISTRATIE_CODE` op Railway aan en de app gebruikt direct de nieuwe code.
Laat je `REGISTRATIE_CODE` helemaal leeg, dan mag iedereen zonder code registreren.

---

## Lokaal draaien (optioneel, voor ontwikkelaars)
1. Zorg dat PostgreSQL lokaal draait.
2. Kopieer `.env.example` naar `.env` en vul de waarden in.
3. `npm install`
4. `npm start` → open http://localhost:3000

---

## Techniek in het kort
- **Node.js + Express** met **EJS**-templates.
- **PostgreSQL** voor alle data; sessies en afbeeldingen staan óók in de database (deploy-bestendig).
- Wachtwoorden veilig opgeslagen met **bcrypt**.
- `trust proxy` + veilige cookies in productie (voorkomt https/cookie-problemen op Railway).
