const dialog = document.querySelector('#bookingDialog');
const form = document.querySelector('#bookingForm');

// Tutti i pulsanti con data-book condividono lo stesso dialog di prenotazione.
document.querySelectorAll('[data-book]').forEach((button) => {
  button.addEventListener('click', () => dialog.showModal());
});

// Il dialog può essere chiuso dal pulsante X oppure cliccando sullo sfondo.
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

form.addEventListener('submit', (event) => {
  // Questa è una demo frontend: impedisce l'invio HTTP reale e mostra la
  // conferma locale. In produzione qui andrebbe chiamata un'API protetta.
  event.preventDefault();
  form.hidden = true;
  dialog.querySelector('.success-message').hidden = false;
});

// Apre e chiude la navigazione sui dispositivi piccoli e mantiene aggiornato
// aria-expanded per le tecnologie assistive.
document.querySelector('.menu-btn').addEventListener('click', (event) => {
  const nav = document.querySelector('.desktop-nav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});

// Dopo la scelta di una sezione, richiude il menu mobile.
document.querySelectorAll('.desktop-nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.desktop-nav').classList.remove('open');
}));

// IntersectionObserver attiva le animazioni solo quando gli elementi entrano
// nell'area visibile, evitando di controllare continuamente lo scroll.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

// Collega le azioni secondarie ai rispettivi comportamenti dimostrativi.
document.querySelector('#findVisit').addEventListener('click', () => dialog.showModal());
document.querySelector('[data-open-search]').addEventListener('click', () => document.querySelector('#specialty').focus());
document.querySelector('#shopButton').addEventListener('click', () => alert('La farmacia online sarà presto disponibile.'));
