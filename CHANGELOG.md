# Versiegeschiedenis

Het versienummer staat in de voettekst van elke pagina en in **Beheer** (met de code van de uitgerolde update).
Bij elke update wordt het nummer in `package.json` opgehoogd en hier beschreven wat er is veranderd.

## 1.5.1 — 31 augustus 2026
- Geen onnodige foutmelding in Beheer zolang het LinkedIn-bestand van de assistent nog niet bestaat (404 wordt stil overgeslagen).

## 1.5.0 — 31 augustus 2026
- **LinkedIn-nieuws op de site**: de dagelijkse assistent verzamelt openbare LinkedIn-berichten van 11 Luchtmobiele Brigade, de Business Club en de Draagploeg Veteranen Luchtmobiele Brigade; ze verschijnen automatisch tussen het nieuws met een knop naar het originele bericht. Verwijderde berichten komen niet terug.
- Nieuwspagina: blok **"Volg ons op LinkedIn"** met knoppen naar de brigade- en clubpagina (ledenwerving).

## 1.4.1 — 31 augustus 2026
- **AIR ASSAULT!** — bij het allereerste bezoek klapt de kreet van de baretuitreiking eenmalig over het scherm, met het motto eronder. Eén keer per bezoeker; wordt overgeslagen bij een ingestelde voorkeur voor minder beweging.

## 1.4.0 — 31 augustus 2026
- **YouTube-video's in de galerij**: plak in *Galerij beheren* een YouTube-link (watch, youtu.be, shorts) en de video verschijnt tussen de foto's met een afspeelknop; afspelen gebeurt op de pagina zelf via de privacyvriendelijke youtube-nocookie-speler (geen cookies vóór het klikken).

## 1.3.2 — 31 augustus 2026
- Voettekst: e-mail- en websitelink staan weer netjes in het adresblok (geen witruimte er omheen).

## 1.3.1 — 31 augustus 2026
- Voettekst: link naar de hoofdsite www.bclmb.nl bij de contactgegevens.

## 1.3.0 — 31 augustus 2026
- **Sitemap en robots.txt** voor zoekmachines: `/sitemap.xml` bevat alle openbare pagina's (nieuws, partners, geplaatste sponsorverzoeken, komende evenementen, vacatures en projecten) en wordt automatisch actueel gehouden; `robots.txt` sluit de besloten delen uit en verwijst naar de sitemap.

## 1.2.7 — 31 augustus 2026
- Embleem in e-mails krijgt het versienummer in zijn adres, zodat Cloudflare niet de oude gecachete kopie (met de oude beveiligingskop) blijft uitleveren.

## 1.2.6 — 31 augustus 2026
- Bug: browsers en Cloudflare bleven een oude versie van het script van de site gebruiken (o.a. geen logo-voorbeeld en kale bestandsknop in formulieren). CSS en JS krijgen nu het versienummer van de site in hun adres, zodat elke update direct doorkomt.

## 1.2.5 — 31 augustus 2026
- Bug: na het wijzigen van het inlogadres van de beheerder maakte de site bij elke herstart opnieuw een beheerdersaccount met het oude adres uit `ADMIN_EMAIL` aan (waardoor het ledental klopte noch veilig was). Er wordt nu alleen een beheerder aangemaakt als er nog geen enkele is.

## 1.2.4 — 31 augustus 2026
- Embleem in e-mails laadde niet in webmail: afbeeldingen onder `/static/img` mogen nu ook vanaf andere sites worden getoond (Cross-Origin-Resource-Policy).
- Wachtwoord-vergeten-mail: dubbele "Werkt de knop niet?"-regel verwijderd.

## 1.2.3 — 31 augustus 2026
- E-mails in huisstijl: kop met embleem en messing accent, rustige typografie, knoppen voor links (met terugvallink), verzorgde voettekst met adres en site; voorproefje naast het onderwerp. Geldt voor alle mails (welkom, wachtwoord, 2FA, meldingen aan het bestuur, sponsorverzoeken, testmail).

## 1.2.2 — 31 augustus 2026
- Beheer: opmaakfout in de e-mailkaart hersteld (`<code>` werd als tekst getoond).

## 1.2.1 — 31 augustus 2026
- Beheer: kaart **E-mail (Resend)** met de huidige instellingen (sleutel aanwezig, afzender, bestuursadres, APP_URL) en een knop **Stuur testmail naar mij** die het exacte antwoord van Resend toont als versturen mislukt.

## 1.2.0 — 31 augustus 2026
- **Nieuws van bclmb.nl**: het nieuws en de blogs van de hoofdsite worden automatisch overgenomen (titel, tekst, datum, hoofdafbeelding, auteur en categorie van blogs), elke 6 uur en via **Nu importeren** in Beheer. Overgenomen berichten linken naar het origineel; verwijderde berichten komen niet terug.
- Nieuwsoverzicht met afbeeldingen en labels; nieuwsdetail met afbeelding, ook in de deelvoorvertoning.

## 1.1.1 — 31 augustus 2026
- Deelvoorvertoning: eigen embleem-afbeelding (800×800, crème achtergrond, 36 kB) in plaats van het grote transparante logo, zodat WhatsApp het embleem betrouwbaar toont.

## 1.1.0 — 31 augustus 2026
- **Sponsorverzoeken**: nieuwe publieke pagina *Sponsoring* met sponsor-, donatie- en steunverzoeken voor militairen en veteranen; controlewachtrij voor bestuur/brigade (plaatsen, afwijzen, bewerken, uitlichten, handmatig toevoegen).
- **Dagelijkse zoekronde**: een Claude-assistent zoekt elke ochtend het Nederlandstalige web af (incl. vaste bronnen en openbare LinkedIn/Facebook-berichten) en zet de vondsten klaar voor controle; e-mail aan het bestuur bij nieuwe verzoeken.
- **Kenmerk** per verzoek (RED2026001, RED2026002, …).
- **Agenda-koppeling**: een geplaatst verzoek met evenementdatum verschijnt automatisch in de agenda (categorie *Sponsoractie*) met een knop naar het verzoek.
- **Deelvoorvertoningen**: links naar de site tonen in WhatsApp, LinkedIn e.d. een kaartje met embleem, titel en omschrijving.
- **Versienummer** in de voettekst en in Beheer.

## 1.0.0 — augustus 2026
- Ledenplatform met ledengids, vacatures, projecten, agenda (met import van bclmb.nl), nieuws, partners, veteranenhub, galerij en beheer.
- Beveiliging: wachtwoord vergeten, tweestapsverificatie, CSRF, rate-limiting, Cloudflare Turnstile, https-afdwinging.
