// Nette bestandskiezer: vervangt de kale browserknop door een eigen knop + bestandsnaam.
function verfraaiBestandsvelden(root) {
  (root || document).querySelectorAll('input[type=file]').forEach(function (input) {
    if (input.closest('.bestand-kiezer')) return;
    const wrapper = document.createElement('label');
    wrapper.className = 'bestand-kiezer';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const knop = document.createElement('span');
    knop.className = 'bestand-knop';
    knop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      (input.dataset.knoptekst || (input.accept && input.accept.indexOf('image') === 0 ? 'Kies afbeelding' : 'Kies bestand'));
    const naam = document.createElement('span');
    naam.className = 'bestand-naam';
    naam.textContent = 'Nog geen bestand gekozen';
    const wissen = document.createElement('button');
    wissen.type = 'button';
    wissen.className = 'bestand-wissen';
    wissen.textContent = 'Wissen';
    wrapper.appendChild(knop);
    wrapper.appendChild(naam);
    wrapper.appendChild(wissen);
    wissen.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
function werkBestandsnaamBij(input) {
  const wrapper = input.closest('.bestand-kiezer');
  if (!wrapper) return;
  const naam = wrapper.querySelector('.bestand-naam');
  const bestand = input.files && input.files[0];
  if (bestand) {
    naam.textContent = bestand.name + ' (' + (bestand.size > 1024 * 1024 ? (bestand.size / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bestand.size / 1024)) + ' kB') + ')';
    wrapper.classList.add('heeft-bestand');
  } else {
    naam.textContent = 'Nog geen bestand gekozen';
    wrapper.classList.remove('heeft-bestand');
  }
}
// Afbeeldingen met een terugvaloptie (geen inline onerror: de CSP staat dat niet toe)
function afbeeldingTerugval(img) {
  if (img.dataset.terugvalKlaar) return;
  img.dataset.terugvalKlaar = '1';
  if (img.dataset.fallback) { img.src = img.dataset.fallback; return; }
  if (img.hasAttribute('data-fallback-verberg')) {
    img.style.display = 'none';
    const volgende = img.nextElementSibling;
    if (volgende) volgende.style.display = 'block';
  }
}
document.addEventListener('error', function (e) {
  const img = e.target;
  if (img && img.tagName === 'IMG' && (img.dataset.fallback || img.hasAttribute('data-fallback-verberg'))) afbeeldingTerugval(img);
}, true);

document.addEventListener('DOMContentLoaded', function () {
  verfraaiBestandsvelden(document);
  document.querySelectorAll('img[data-fallback], img[data-fallback-verberg]').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) afbeeldingTerugval(img);
  });
});

// Mobiel menu togglen, afdrukken, bedrijfsblokken toevoegen/verwijderen
document.addEventListener('click', function (e) {
  // Galerij: YouTube-video afspelen (thumbnail vervangen door de ingesloten speler)
  const video = e.target.closest('[data-youtube]');
  if (video) {
    const kader = document.createElement('div');
    kader.className = 'video-kader';
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.dataset.youtube) + '?autoplay=1&rel=0';
    frame.title = video.dataset.titel || 'Video';
    frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    kader.appendChild(frame);
    video.replaceWith(kader);
    return;
  }

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
    verfraaiBestandsvelden(nieuw);
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

  if (el.matches && el.matches('input[type=file]')) werkBestandsnaamBij(el);

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
