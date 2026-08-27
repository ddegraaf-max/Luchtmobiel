// Mobiel menu togglen, afdrukken, bedrijfsblokken toevoegen/verwijderen
document.addEventListener('click', function (e) {
  const toggle = e.target.closest('.nav-toggle');
  if (toggle) {
    const nav = toggle.closest('.nav');
    if (nav) nav.classList.toggle('open');
  }

  // Afdrukken (herstelcodes)
  if (e.target.closest('[data-print]')) window.print();

  // Profiel: bedrijf toevoegen
  const toevoegen = e.target.closest('[data-bedrijf-toevoegen]');
  if (toevoegen) {
    const lijst = document.querySelector('[data-bedrijven]');
    const sjabloon = document.getElementById('bedrijf-sjabloon');
    if (!lijst || !sjabloon) return;
    if (lijst.querySelectorAll('[data-bedrijf]').length >= 10) { alert('Je kunt maximaal 10 bedrijven toevoegen.'); return; }
    const idx = Number(lijst.dataset.volgende || lijst.querySelectorAll('[data-bedrijf]').length);
    lijst.dataset.volgende = String(idx + 1);
    lijst.insertAdjacentHTML('beforeend', sjabloon.innerHTML.replace(/__I__/g, String(idx)));
    const nieuw = lijst.lastElementChild;
    if (!lijst.querySelector('input[name="hoofdbedrijf"]:checked')) {
      const radio = nieuw.querySelector('input[name="hoofdbedrijf"]');
      if (radio) radio.checked = true;
    }
    const leeg = document.querySelector('.lege-bedrijven');
    if (leeg) leeg.style.display = 'none';
    const eerste = nieuw.querySelector('input[type=text]');
    if (eerste) eerste.focus();
  }

  // Profiel: bedrijf verwijderen
  const verwijderen = e.target.closest('[data-bedrijf-verwijderen]');
  if (verwijderen) {
    const blok = verwijderen.closest('[data-bedrijf]');
    if (!blok) return;
    if (verwijderen.dataset.bestaand && !confirm('Dit bedrijf van je profiel verwijderen? Dit wordt definitief zodra je op "Profiel opslaan" klikt.')) return;
    const wasHoofd = blok.querySelector('input[name="hoofdbedrijf"]:checked');
    blok.remove();
    const lijst = document.querySelector('[data-bedrijven]');
    if (lijst) {
      if (wasHoofd) {
        const volgende = lijst.querySelector('input[name="hoofdbedrijf"]');
        if (volgende) volgende.checked = true;
      }
      const leeg = document.querySelector('.lege-bedrijven');
      if (leeg && !lijst.querySelector('[data-bedrijf]')) leeg.style.display = '';
    }
  }
});

// Bevestiging voor verwijderacties en andere gevoelige formulieren
document.addEventListener('submit', function (e) {
  const form = e.target;
  if (form.dataset.bevestig) {
    if (!confirm(form.dataset.bevestig)) e.preventDefault();
  }
});

// Formulieren die direct verzenden bij wijziging (filters, rol-keuze)
document.addEventListener('change', function (e) {
  const el = e.target;
  if (el.matches && el.matches('[data-auto-submit]') && el.form) {
    el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
  }

  // Direct voorbeeld tonen van een gekozen afbeelding (foto, logo)
  if (el.matches && el.matches('input[type=file][data-voorbeeld]')) {
    const beeld = document.querySelector(el.dataset.voorbeeld);
    const verberg = el.dataset.verberg ? document.querySelector(el.dataset.verberg) : null;
    const melding = el.dataset.melding ? document.querySelector(el.dataset.melding) : document.getElementById('logo-melding');
    const bestand = el.files && el.files[0];
    if (!beeld) return;
    if (bestand && /^image\//.test(bestand.type)) {
      if (beeld.dataset.origineel === undefined) beeld.dataset.origineel = beeld.getAttribute('src') || '';
      if (beeld.src && beeld.src.indexOf('blob:') === 0) URL.revokeObjectURL(beeld.src);
      beeld.src = URL.createObjectURL(bestand);
      beeld.hidden = false;
      if (verberg) verberg.hidden = true;
      if (melding) melding.style.display = 'block';
    } else {
      // Keuze geannuleerd: terug naar de oorspronkelijke situatie
      const origineel = beeld.dataset.origineel || '';
      if (origineel) { beeld.src = origineel; beeld.hidden = false; if (verberg) verberg.hidden = true; }
      else { beeld.hidden = true; beeld.removeAttribute('src'); if (verberg) verberg.hidden = false; }
      if (melding) melding.style.display = 'none';
    }
  }
});
