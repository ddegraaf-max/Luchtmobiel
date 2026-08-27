// Mobiel menu togglen
document.addEventListener('click', function (e) {
  const toggle = e.target.closest('.nav-toggle');
  if (toggle) {
    const nav = toggle.closest('.nav');
    if (nav) nav.classList.toggle('open');
  }

  // Afdrukken (herstelcodes)
  if (e.target.closest('[data-print]')) window.print();
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

  // Direct voorbeeld tonen van een gekozen afbeelding (bijv. profiel-logo)
  if (el.matches && el.matches('input[type=file][data-voorbeeld]')) {
    const beeld = document.querySelector(el.dataset.voorbeeld);
    const verberg = el.dataset.verberg ? document.querySelector(el.dataset.verberg) : null;
    const melding = document.getElementById('logo-melding');
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
