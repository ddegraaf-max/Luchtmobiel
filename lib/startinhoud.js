// Startinhoud: nieuwsberichten en sponsorverzoeken die bij het opstarten één keer worden
// geplaatst (markering in de tabel instellingen). Daarna beheert het bestuur ze zoals elk ander
// bericht of verzoek; verwijderen is definitief, ze komen niet terug.
//
// De bijbehorende bestanden (PDF van de nieuwsbrief, omslagfoto) staan in data/nieuwsbrieven en
// worden bij het plaatsen in de media-tabel gezet, zodat ze net als uploads via de site worden
// uitgeleverd.

const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { detecteerAfbeelding, detecteerPdf } = require('./upload');

const MAP = path.join(__dirname, '..', 'data', 'nieuwsbrieven');

const NIEUWSBERICHTEN = [
  {
    marker: 'nieuws_vrb_nieuwsbrief_2026_4',
    titel: 'VRB-Nieuwsbrief 2026-4: Market Garden, de Memorial Tour en een Anjerperkje bij de Witte Kapel',
    categorie: 'Nieuwsbrief · VRB',
    afbeelding: 'vrb-nieuwsbrief-2026-4.jpg',
    bijlage: 'vrb-nieuwsbrief-2026-4.pdf',
    bijlage_naam: 'VRB-Nieuwsbrief 2026-4 (nummer 26, november 2026)',
    inhoud: `De Vrienden Rode Baret (VRB) hebben hun laatste nieuwsbrief van 2026 uitgebracht. Een nummer vol herdenken en kameraadschap: de Henry & Kevin Memorial Tour, de herdenking van Market Garden op de Ginkelse heide, de Draagploeg Veteranen Luchtmobiel, Recovery on the Battlefield en een inzamelactie voor een Witte Anjerperkje bij de Witte Kapel. Hieronder de hoofdpunten; de volledige nieuwsbrief met alle foto's staat als PDF bij dit bericht.

## Van de voorzitter
Voorzitter Nico Geerts blikt terug op een zomer waarin de brigade druk was met Falcon Leap, Market Garden en Falcon Autumn. De VRB ondersteunde de brigadesportdag, reed mee in de Henry & Kevin Memorial Bike Ride in en rond Assen (samen met de BOSS en 13 Infbat RSPB) en was aanwezig bij de Market Garden-herdenking op de Ginkelse heide. Nieuw dit jaar: het Airborneplein, waar (oud-)luchtmobielers elkaar ontmoeten, een koffie drinken en met hun gezin de droppings bekijken. Het geplande bezoek aan de oefening Falcon Leap kon helaas niet doorgaan.

In december organiseert de VRB nog een activiteit met als onderwerp "LMB en drones"; de datum volgt via e-mail en sociale media. Het lustrum 2027 en het jaarplan 2027 staan in de steigers. Het credo blijft ongewijzigd: voor en door de Vrienden en met de Brigade.

## De Witte Kapel: een plek met een nieuwe betekenis
De Witte Kapel op het landgoed Oud Vrijland in Schaarsbergen heeft een nieuwe functie als inloop-, herdenkings- en activiteitenhuis van 11 Luchtmobiele Brigade, speciaal voor veteranen, collega's en nabestaanden. Het Veteranenbureau 11 LMB wil bij de kapel een Witte Anjerperkje aanleggen, het symbool van waardering voor veteranen, en houdt daarvoor een inzamelactie. Je bijdrage gaat naar de aanschaf van het perkje, de plaatsing en inrichting bij de kapel en het onderhoud.

Vrijwillige bijdrage op IBAN NL40 INGB 0000 1008 59 t.n.v. Vereniging Veteranen Grenadiers en Jagers, o.v.v. Anjerperkje Witte Kapel. Doneren kan ook via het ING-betaalverzoek achter de QR-code in de nieuwsbrief. Deze inzamelactie staat ook bij de sponsorverzoeken op deze site, met een directe knop naar het betaalverzoek.

## Opdat we nooit vergeten: Henry & Kevin Memorial Tour
Op 6 juli vond de Henry en Kevin Memorial Tour plaats, dit jaar precies tien jaar nadat sergeant Henry Hoving en korporaal Kevin Roggeveld tijdens hun inzet in Mali om het leven kwamen. Negentien wielrenners, vooral actief dienend personeel aangevuld met veteranen en de oud-brigadecommandanten generaals b.d. Kees Matthijssen en Ron Smits, reden circa 145 kilometer door Drenthe en Groningen, langs de laatste rustplaatsen en het ouderlijk huis van beide collega's. Bij de herdenkingslocaties in Winschoten en Hoogkerk stonden een Apache, een Chinook en een NH90 van de Tactische Helikoptergroep. In Bosnië hield de C-Margriet Para Compagnie tegelijkertijd een WOD ter nagedachtenis aan de twee gevallen Para Stoters.

RTV Drenthe, TV Noord en het Dagblad van het Noorden besteedden aandacht aan deze tiende herdenking. "Ontspanning door inspanning" was de rode draad van de dag; de diepere betekenis was en blijft het samen herinneren. Henry en Kevin, tien jaar later: nog altijd in ons midden. (Elnt Spencer Pattiwael van Westerloo)

## Draagploeg Veteranen Luchtmobiel (DVLMB)
De DVLMB heeft dit jaar inmiddels 17 uitvaarten en asverstrooiingen verzorgd, met respect, vakkundigheid en een kameraadschap die rangen en standen te boven gaat. De groep van ruim 35 dragers komt uit alle bataljons en zelfstandige eenheden, van soldaat tot kolonel, en staat open voor nieuwe leden. Ben je tussen de 1.60 en 1.85 meter, nog fysiek inzetbaar en toonbaar? Meld je aan via de website van de DVLMB of woon een keer de maandelijkse training bij in de Witte Kapel, de huiskamer van de brigade.

## Recovery on the Battlefield
De stichting Recovery On The Battlefield (ROTB), ontstaan uit de samenwerking met het Britse Waterloo Uncovered, laat lichamelijk of psychisch gewond geraakte veteranen via archeologisch onderzoek op voormalige slagvelden hun ervaringen een plek geven. Afgelopen juni droegen veteranen met onder meer metaaldetectoren bij aan het onderzoek naar de Slag bij Ane (1227), samen met de Rijksdienst voor het Cultureel Erfgoed, de Stichting Overstichtse Oorlogen en A.S.R.; in maart 2026 deed ROTB zelfstandig onderzoek bij het Nederlandse monument in Quatre Bras. In 2027 volgt een vergelijkbaar project. Meer informatie op www.rotb.nl; meedoen kan via info@rotb.nl.

## Herdenking Market Garden 2026
Ook na 82 jaar blijft de herdenking op de Ginkelse heide waardig en respectvol, met enkele veteranen van destijds in het midden en met de minister en de staatssecretaris van Defensie aanwezig. De herdenking werd geleid door elnt b.d. Peter B. en adj b.d. Ron B., met een muzikale afsluiting door de Falcon Guards. Het weer werkte mee: de parasprongen en de luchtmobiele demonstratie gingen door. Voor het eerst was er het Airborneplein naast het drop-off punt, waar VRB-ers ondersteuning leverden. Op naar 2027.

## Ondersteuning Market Garden 2026
Vijf "oude" luchtmobielers (Ron Foppen, Tom, Stefan, Ronald en Mario) staken op zaterdag 19 september de handen uit de mouwen bij Falcon Leap/Market Garden: kwartiermaken, consumptiemunten uitgeven, kabels ingraven tegen struikelgevaar en ondersteuning op het Airborneplein. Ondertussen kwamen de vliegtuigen over en sprongen de para's ondanks de wind. Wat de dag geslaagd maakte: de integratie van jonge actieve luchtmobielers en de "oude stompen". Er is een opdracht, analyse, een plan en zie: de uitvoering is daar. Volgend jaar zijn ze er weer bij.

## Reünie 11 Luchtmobiele Brigade: 8 juli 2027
Zet alvast in de agenda: op 8 juli 2027 is de reünie van 11 Luchtmobiele Brigade op de Oranjekazerne in Schaarsbergen. Verras ons en kom met velen; vertel het de maten en zegt het voort. Meer informatie en aanmelden via reunie11lmb.nl.

Bron: VRB-Nieuwsbrief 2026-4 (nummer 26, november 2026) van de Vrienden Rode Baret. De volledige nieuwsbrief met alle foto's staat als PDF bij dit bericht.`
  }
];

const SPONSORVERZOEKEN = [
  {
    marker: 'sponsor_anjerperkje_witte_kapel',
    titel: 'Witte Anjerperkje bij de Witte Kapel',
    organisatie: 'Veteranenbureau 11 Luchtmobiele Brigade',
    doelgroep: 'Veteranen',
    plaats: 'Schaarsbergen',
    url: 'https://www.ing.nl/payreq/m/?trxid=YTSiv9pbAoEa5Rso729E5wygQSzlS8BX',
    bron_naam: 'VRB-Nieuwsbrief 2026-4 (Vrienden Rode Baret)',
    uitgelicht: true,
    samenvatting: 'Help mee een Witte Anjerperkje aan te leggen bij de Witte Kapel op landgoed Oud Vrijland in Schaarsbergen: het symbool van waardering voor veteranen, bij het inloop-, herdenkings- en activiteitenhuis van 11 Luchtmobiele Brigade.',
    omschrijving: `Veel (oud-)collega's kennen de Witte Kapel op het landgoed Oud Vrijland in Schaarsbergen niet of nauwelijks. De kapel heeft een nieuwe functie als inloop-, herdenkings- en activiteitenhuis van 11 Luchtmobiele Brigade, speciaal voor veteranen, collega's en nabestaanden. Het is ook de huiskamer van de Draagploeg Veteranen Luchtmobiel.

Het Veteranenbureau 11 LMB wil bij de kapel een Witte Anjerperkje aanleggen, het symbool van waardering voor veteranen, en houdt daarvoor een inzamelactie. Het perkje komt er alleen als er gedoneerd wordt.

Waar jouw bijdrage aan wordt besteed:
• Aanschaf van het Anjerperkje
• Plaatsing en inrichting bij de kapel
• Onderhoud

Zo draag je bij:
Vrijwillige bijdrage op IBAN NL40 INGB 0000 1008 59
t.n.v. Vereniging Veteranen Grenadiers en Jagers
o.v.v. Anjerperkje Witte Kapel

Liever met je telefoon? De knop "Naar het verzoek" opent het ING-betaalverzoek van het Veteranenbureau, dezelfde link als de QR-code in de nieuwsbrief.

Dank voor je steun! Deze oproep komt uit de VRB-Nieuwsbrief 2026-4 van de Vrienden Rode Baret; de nieuwsbrief staat bij het nieuws op deze site.`
  }
];

async function gedaan(marker) {
  return (await pool.query('SELECT 1 FROM instellingen WHERE sleutel = $1', [marker])).rowCount > 0;
}

async function markeer(marker) {
  await pool.query('INSERT INTO instellingen (sleutel, waarde) VALUES ($1, $2) ON CONFLICT (sleutel) DO NOTHING', [marker, new Date().toISOString()]);
}

// Leest een bestand uit data/nieuwsbrieven, controleert het type aan de inhoud en zet het in media.
async function bewaarBestand(naam, detecteer) {
  const pad = path.join(MAP, naam);
  if (!fs.existsSync(pad)) { console.warn('[startinhoud] bestand ontbreekt:', naam); return null; }
  const buf = fs.readFileSync(pad);
  const mime = detecteer(buf);
  if (!mime) { console.warn('[startinhoud] bestand heeft een onverwacht type:', naam); return null; }
  const { rows } = await pool.query('INSERT INTO media (mime, data, eigenaar_id) VALUES ($1, $2, NULL) RETURNING id', [mime, buf]);
  return rows[0].id;
}

async function plaatsStartinhoud() {
  const geplaatst = { nieuws: 0, sponsorverzoeken: 0 };

  for (const b of NIEUWSBERICHTEN) {
    if (await gedaan(b.marker)) continue;
    try {
      const afbId = b.afbeelding ? await bewaarBestand(b.afbeelding, detecteerAfbeelding) : null;
      const bijlageId = b.bijlage ? await bewaarBestand(b.bijlage, detecteerPdf) : null;
      await pool.query(
        `INSERT INTO nieuws (titel, inhoud, categorie, gepubliceerd, auteur_id, afbeelding_id, bijlage_id, bijlage_naam)
         VALUES ($1,$2,$3,true,NULL,$4,$5,$6)`,
        [b.titel, b.inhoud, b.categorie, afbId, bijlageId, bijlageId ? b.bijlage_naam : null]
      );
      await markeer(b.marker);
      geplaatst.nieuws += 1;
      console.log('[startinhoud] Nieuwsbericht geplaatst:', b.titel);
    } catch (err) {
      console.error('[startinhoud] Nieuwsbericht plaatsen mislukt:', b.marker, err.message);
    }
  }

  for (const s of SPONSORVERZOEKEN) {
    if (await gedaan(s.marker)) continue;
    try {
      const si = require('./sponsor-import');
      const admin = (await pool.query("SELECT id FROM users WHERE rol = 'admin' ORDER BY id LIMIT 1")).rows[0];
      const urlSleutel = si.normaliseerUrl(s.url);
      // Al bekend (bijvoorbeeld al gevonden door de assistent)? Dan niets dubbel plaatsen.
      const bestaat = (await pool.query('SELECT 1 FROM sponsorverzoeken WHERE url_sleutel = $1', [urlSleutel])).rowCount;
      if (!bestaat) {
        const kenmerk = await si.volgendKenmerk();
        await pool.query(
          `INSERT INTO sponsorverzoeken (titel, organisatie, samenvatting, omschrijving, url, url_sleutel, titel_sleutel, bron, bron_naam,
             doelgroep, plaats, status, uitgelicht, auteur_id, beoordeeld_door, beoordeeld_op, in_agenda, kenmerk)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'geplaatst',$12,$13,$13,now(),false,$14)`,
          [s.titel, s.organisatie, s.samenvatting, s.omschrijving, s.url, urlSleutel, si.titelSleutel(s.titel), si.BRON_HANDMATIG, s.bron_naam,
            s.doelgroep, s.plaats, s.uitgelicht, admin ? admin.id : null, kenmerk]
        );
        geplaatst.sponsorverzoeken += 1;
        console.log('[startinhoud] Sponsorverzoek geplaatst:', kenmerk, s.titel);
      }
      await markeer(s.marker);
    } catch (err) {
      console.error('[startinhoud] Sponsorverzoek plaatsen mislukt:', s.marker, err.message);
    }
  }

  return geplaatst;
}

module.exports = { NIEUWSBERICHTEN, SPONSORVERZOEKEN, MAP, plaatsStartinhoud };
