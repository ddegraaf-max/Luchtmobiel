// Mobiel menu togglen
document.addEventListener('click', function (e) {
  const toggle = e.target.closest('.nav-toggle');
  if (toggle) {
    const nav = toggle.closest('.nav');
    if (nav) nav.classList.toggle('open');
  }
});

// Bevestiging voor verwijderacties
document.addEventListener('submit', function (e) {
  const form = e.target;
  if (form.dataset.bevestig) {
    if (!confirm(form.dataset.bevestig)) e.preventDefault();
  }
});
