const dialog = document.querySelector('#bookingDialog');
const form = document.querySelector('#bookingForm');

document.querySelectorAll('[data-book]').forEach((button) => {
  button.addEventListener('click', () => dialog.showModal());
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  form.hidden = true;
  dialog.querySelector('.success-message').hidden = false;
});

document.querySelector('.menu-btn').addEventListener('click', (event) => {
  const nav = document.querySelector('.desktop-nav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});

document.querySelectorAll('.desktop-nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.desktop-nav').classList.remove('open');
}));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

document.querySelector('#findVisit').addEventListener('click', () => dialog.showModal());
document.querySelector('[data-open-search]').addEventListener('click', () => document.querySelector('#specialty').focus());
document.querySelector('#shopButton').addEventListener('click', () => alert('La farmacia online sarà presto disponibile.'));
