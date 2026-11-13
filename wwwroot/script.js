const dialog = document.querySelector('#bookingDialog');
const form = document.querySelector('#bookingForm');
const errorMessage = form.querySelector('.form-error');
const doctorSelect = document.querySelector('#bookingDoctor');
const specialtySelect = document.querySelector('#specialty');
const locationSelect = document.querySelector('#location');
const bookingDate = document.querySelector('#bookingDate');
const serviceSelect = document.querySelector('#bookingService');
const slotSelect = document.querySelector('#bookingSlot');
const slotMessage = document.querySelector('#slotMessage');
let calendarVersion = 0;
let doctorVersion = 0;
let doctors = [];

function clinicDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function clearSlots(message = 'Scegli medico e giorno') {
  slotSelect.replaceChildren(new Option(message, ''));
  slotMessage.textContent = message;
}

async function loadSlots() {
  const version = ++calendarVersion;
  clearSlots();
  if (!doctorSelect.value || !bookingDate.value || !bookingDate.checkValidity()) return;
  clearSlots('Caricamento disponibilità…');
  try {
    const query = new URLSearchParams({ date: bookingDate.value });
    if (serviceSelect.value) query.set('medicalServiceId', serviceSelect.value);
    const slots = await apiRequest(`/api/doctors/${doctorSelect.value}/slots?${query}`);
    if (version !== calendarVersion) return;
    const time = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    slotSelect.replaceChildren(new Option(slots.length ? 'Seleziona un orario' : 'Nessun orario disponibile', ''));
    slots.forEach((slot) => slotSelect.add(new Option(
      `${time.format(new Date(slot.startsAt))} – ${time.format(new Date(slot.endsAt))} (${slot.durationMinutes} min)`, slot.startsAt)));
    slotMessage.textContent = slots.length ? 'Orari della clinica (Roma). La disponibilità viene ricontrollata alla conferma.'
      : 'Nessuna disponibilità per questo giorno. Prova un’altra data o prestazione.';
  } catch (error) {
    if (version !== calendarVersion) return;
    clearSlots('Disponibilità non caricata. Cambia giorno per riprovare.');
  }
}

async function doctorChanged() {
  ++calendarVersion;
  const version = ++doctorVersion;
  serviceSelect.replaceChildren(new Option('Visita standard del turno', ''));
  serviceSelect.disabled = true;
  clearSlots();
  try {
    if (doctorSelect.value) {
      const services = await apiRequest(`/api/medical-services?active=true&doctorId=${doctorSelect.value}`);
      if (version !== doctorVersion) return;
      services.forEach((service) => serviceSelect.add(new Option(`${service.name} (${service.durationMinutes} min)`, service.id)));
    }
    if (version === doctorVersion) await loadSlots();
  } catch (error) {
    if (version === doctorVersion) clearSlots('Prestazioni non caricate. Seleziona nuovamente il medico.');
  } finally {
    if (doctorSelect.value && version === doctorVersion) serviceSelect.disabled = false;
  }
}

doctorSelect.addEventListener('change', doctorChanged);
bookingDate.addEventListener('change', loadSlots);
serviceSelect.addEventListener('change', loadSlots);

// Esegue una richiesta JSON alla stessa applicazione e produce un messaggio
// comprensibile anche quando il server restituisce un errore di validazione.
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (response.ok) return response.status === 204 ? null : response.json();

  const problem = await response.json().catch(() => ({}));
  const validationText = problem.errors && Object.values(problem.errors).flat().join(' ');
  throw new Error(problem.message || validationText || problem.detail || 'Operazione non riuscita. Riprova.');
}

function fillSelect(select, items, placeholder, labelSelector = (item) => item.name) {
  select.replaceChildren(new Option(placeholder, ''));
  items.forEach((item) => select.add(new Option(labelSelector(item), item.id)));
}

function doctorInitials(fullName) {
  return fullName.replace(/Dott\.ssa|Dott\./gi, '').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function renderDoctors(items) {
  const list = document.querySelector('#doctorList');
  list.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nessun medico disponibile per i filtri selezionati.';
    list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((doctor, index) => {
    const article = document.createElement('article');
    const avatar = document.createElement('div');
    avatar.className = `doctor-avatar ${['blue', 'peach', 'mint'][index % 3]}`;
    avatar.textContent = doctorInitials(doctor.fullName);
    const details = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = doctor.fullName;
    const specialty = document.createElement('p');
    specialty.textContent = `${doctor.specialty} · ${doctor.location}`;
    details.append(name, specialty);
    const availability = document.createElement('span');
    availability.textContent = doctor.isAvailable ? 'Disponibile' : 'Non disponibile';
    article.append(avatar, details, availability);
    fragment.append(article);
  });
  list.append(fragment);
}

async function loadReferenceData() {
  try {
    const [specialties, locations, loadedDoctors] = await Promise.all([
      apiRequest('/api/specialties'),
      apiRequest('/api/locations'),
      apiRequest('/api/doctors'),
    ]);
    doctors = loadedDoctors;
    fillSelect(specialtySelect, specialties, 'Tutte le specialità');
    fillSelect(locationSelect, locations, 'Tutte le sedi');
    fillSelect(doctorSelect, doctors.filter((doctor) => doctor.isAvailable), 'Seleziona un medico',
      (doctor) => `${doctor.fullName} — ${doctor.specialty}`);
    renderDoctors(doctors);
  } catch (error) {
    console.error('Impossibile caricare i dati dal database:', error);
    specialtySelect.replaceChildren(new Option('Dati non disponibili', ''));
    locationSelect.replaceChildren(new Option('Dati non disponibili', ''));
    doctorSelect.replaceChildren(new Option('Prenotazioni non disponibili', ''));
    renderDoctors([]);
  }
}

// Tutti i pulsanti con data-book condividono lo stesso dialog di prenotazione.
document.querySelectorAll('[data-book]').forEach((button) => {
  button.addEventListener('click', () => {
    fillSelect(doctorSelect, doctors.filter((doctor) => doctor.isAvailable), 'Seleziona un medico',
      (doctor) => `${doctor.fullName} — ${doctor.specialty}`);
    refreshDateMinimum();
    bookingDate.value = bookingDate.min;
    doctorChanged();
    dialog.showModal();
  });
});

// Il dialog può essere chiuso dal pulsante X oppure cliccando sullo sfondo.
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  calendarVersion++;
  doctorVersion++;
  clearSlots();
  serviceSelect.replaceChildren(new Option('Visita standard del turno', ''));
  form.reset();
  form.hidden = false;
  errorMessage.hidden = true;
  dialog.querySelector('.success-message').hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  errorMessage.hidden = true;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Registrazione…';

  try {
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      patientName: values.patientName,
      phone: values.phone,
      email: values.email || null,
      doctorId: Number(values.doctorId),
      medicalServiceId: values.medicalServiceId ? Number(values.medicalServiceId) : null,
      appointmentDate: new Date(values.appointmentDate).toISOString(),
      notes: values.notes || null,
      status: 'In attesa',
    };

    const result = await apiRequest('/api/appointments', { method: 'POST', body: JSON.stringify(payload) });
    document.querySelector('#bookingReference').textContent = `AUR-${String(result.id).padStart(6, '0')}`;
    form.hidden = true;
    dialog.querySelector('.success-message').hidden = false;
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    await loadSlots();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Richiedi appuntamento →';
  }
});

// Apre e chiude la navigazione sui dispositivi piccoli e mantiene aggiornato
// aria-expanded per le tecnologie assistive.
document.querySelector('.menu-btn').addEventListener('click', (event) => {
  const nav = document.querySelector('.desktop-nav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});

document.querySelectorAll('.desktop-nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.desktop-nav').classList.remove('open');
  document.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
}));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

// Filtra i medici caricati dal database e trasferisce la data scelta nel form.
document.querySelector('#findVisit').addEventListener('click', () => {
  const specialtyId = Number(specialtySelect.value);
  const locationId = Number(locationSelect.value);
  const filtered = doctors.filter((doctor) => doctor.isAvailable
    && (!specialtyId || doctor.specialtyId === specialtyId)
    && (!locationId || doctor.locationId === locationId));
  fillSelect(doctorSelect, filtered, 'Seleziona un medico', (doctor) => `${doctor.fullName} — ${doctor.specialty}`);
  refreshDateMinimum();
  const dateInput = document.querySelector('#date');
  if (!dateInput.reportValidity()) return;
  const selectedDate = dateInput.value;
  bookingDate.value = selectedDate || bookingDate.min;
  doctorChanged();
  dialog.showModal();
});

document.querySelector('[data-open-search]').addEventListener('click', () => specialtySelect.focus());
document.querySelector('#shopButton').addEventListener('click', () => alert('Il catalogo viene gestito nel database ed è in preparazione.'));

// Impedisce al browser di proporre date passate e carica i dati iniziali.
function refreshDateMinimum() {
  bookingDate.min = clinicDate();
  document.querySelector('#date').min = bookingDate.min;
}
refreshDateMinimum();
loadReferenceData();
