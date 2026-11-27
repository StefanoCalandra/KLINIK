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
let referenceState = 'loading';
let referencePromise;
let bookingFilters = { specialtyId: 0, locationId: 0 };
let bookingSession = 0;
let submitting = false;
const dataStatus = document.querySelector('#bookingDataStatus');
const retryData = document.querySelector('#retryBookingData');
const showAllDoctors = document.querySelector('#showAllDoctors');
const nextAvailable = document.querySelector('#nextAvailable');
let slotsController;
let servicesController;
const clinicDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const clinicTimeFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

function clinicDate() {
  return clinicDayFormat.format(new Date());
}

function clearSlots(message = 'Scegli medico e giorno') {
  slotSelect.replaceChildren(new Option(message, ''));
  slotMessage.textContent = message;
  nextAvailable.hidden = true;
}

async function loadSlots() {
  const version = ++calendarVersion;
  slotsController?.abort();
  slotsController = new AbortController();
  clearSlots();
  if (!doctorSelect.value || !bookingDate.value || !bookingDate.checkValidity()) return;
  clearSlots('Caricamento disponibilità…');
  try {
    const query = new URLSearchParams({ date: bookingDate.value });
    if (serviceSelect.value) query.set('medicalServiceId', serviceSelect.value);
    const slots = await apiRequest(`/api/doctors/${doctorSelect.value}/slots?${query}`, { signal: slotsController.signal });
    if (version !== calendarVersion) return;
    nextAvailable.hidden = slots.length > 0;
    slotSelect.replaceChildren(new Option(slots.length ? 'Seleziona un orario' : 'Nessun orario disponibile', ''));
    slots.forEach((slot) => slotSelect.add(new Option(
      `${clinicTimeFormat.format(new Date(slot.startsAt))} – ${clinicTimeFormat.format(new Date(slot.endsAt))} (${slot.durationMinutes} min)`, slot.startsAt)));
    slotMessage.textContent = slots.length ? 'Orari della clinica (Roma). La disponibilità viene ricontrollata alla conferma.'
      : 'Nessuna disponibilità per questo giorno. Prova un’altra data o prestazione.';
  } catch (error) {
    if (error.name === 'AbortError' || version !== calendarVersion) return;
    clearSlots('Orari non caricati. Premi Riprova caricamento per riprovare.');
    retryData.hidden = false;
  }
}

async function doctorChanged() {
  ++calendarVersion;
  slotsController?.abort();
  servicesController?.abort();
  servicesController = new AbortController();
  const version = ++doctorVersion;
  serviceSelect.replaceChildren(new Option('Visita standard del turno', ''));
  serviceSelect.disabled = true;
  clearSlots();
  try {
    if (doctorSelect.value) {
      const services = await apiRequest(`/api/medical-services?active=true&doctorId=${doctorSelect.value}`, { signal: servicesController.signal });
      if (version !== doctorVersion) return;
      services.forEach((service) => serviceSelect.add(new Option(`${service.name} (${service.durationMinutes} min)`, service.id)));
    }
    if (version === doctorVersion) await loadSlots();
  } catch (error) {
    if (error.name !== 'AbortError' && version === doctorVersion) clearSlots('Prestazioni non caricate. Seleziona nuovamente il medico.');
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
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });

  const json = (response.headers.get('Content-Type') || '').includes('json');
  if (response.status === 204 && response.ok) return null;
  if (!json) throw new Error('Il server non ha restituito i dati della clinica. In Visual Studio arresta e riavvia il progetto ASP.NET Core, poi premi Riprova caricamento.');
  const data = await response.json();
  if (response.ok) return data;
  const validationText = data.errors && Object.values(data.errors).flat().join(' ');
  throw new Error(data.message || validationText || data.detail || 'Operazione non riuscita. Riprova.');
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

function updateDoctorChoices(preferred = doctorSelect.value) {
  const available = doctors.filter((doctor) => doctor.isAvailable);
  const filtered = available.filter((doctor) => (!bookingFilters.specialtyId || doctor.specialtyId === bookingFilters.specialtyId)
    && (!bookingFilters.locationId || doctor.locationId === bookingFilters.locationId));
  fillSelect(doctorSelect, filtered, filtered.length ? 'Seleziona un medico' : 'Nessun medico per questi filtri',
    (doctor) => `${doctor.fullName} — ${doctor.specialty} · ${doctor.location}`);
  if (filtered.some((doctor) => String(doctor.id) === preferred)) doctorSelect.value = preferred;
  else if (filtered.length === 1) doctorSelect.value = filtered[0].id;
  doctorSelect.disabled = !filtered.length;
  showAllDoctors.hidden = !!filtered.length || !available.length;
  dataStatus.textContent = filtered.length ? `${filtered.length} medici selezionabili. Scegli medico e giorno per vedere gli orari.`
    : available.length ? 'Nessun medico corrisponde alla specialità e alla sede scelte. Puoi cambiare i filtri o mostrare tutti i medici.'
    : 'Nessun medico prenotabile nel database. Verifica che i medici siano disponibili e abbiano turni configurati.';
  form.querySelector('button[type=submit]').disabled = submitting || !filtered.length;
}

async function loadReferenceData(force = false) {
  if (referencePromise) return referencePromise;
  if (referenceState === 'ready' && !force) return true;
  referenceState = 'loading';
  doctorSelect.disabled = true;
  retryData.hidden = true;
  dataStatus.textContent = 'Caricamento medici dal database…';
  form.querySelector('button[type=submit]').disabled = true;
  referencePromise = (async () => {
    try {
      let data;
      try {
        data = await apiRequest('/api/reference-data');
        if (!Array.isArray(data.doctors) || !Array.isArray(data.specialties) || !Array.isArray(data.locations))
          throw new Error('Dati di riferimento incompleti.');
      } catch {
        // Compatibilità con installazioni dove manca ancora la procedura aggregata.
        const [specialties, locations, loadedDoctors] = await Promise.all([
          apiRequest('/api/specialties'), apiRequest('/api/locations'), apiRequest('/api/doctors'),
        ]);
        if (![specialties, locations, loadedDoctors].every(Array.isArray)) throw new Error('Dati di riferimento incompleti.');
        data = { specialties, locations, doctors: loadedDoctors };
      }
      const specialty = specialtySelect.value, location = locationSelect.value;
      doctors = data.doctors;
      fillSelect(specialtySelect, data.specialties, 'Tutte le specialità');
      fillSelect(locationSelect, data.locations, 'Tutte le sedi');
      if ([...specialtySelect.options].some((x) => x.value === specialty)) specialtySelect.value = specialty;
      if ([...locationSelect.options].some((x) => x.value === location)) locationSelect.value = location;
      referenceState = 'ready';
      updateDoctorChoices();
      renderDoctors(doctors);
      return true;
    } catch (error) {
      referenceState = 'failed';
      fillSelect(doctorSelect, [], 'Medici non caricati');
      doctorSelect.disabled = true;
      dataStatus.textContent = `Impossibile caricare i medici. ${error.message}`;
      retryData.hidden = false;
      showAllDoctors.hidden = true;
      return false;
    } finally {
      referencePromise = null;
    }
  })();
  return referencePromise;
}

async function openBooking(filtered = false) {
  const dateInput = document.querySelector('#date');
  refreshDateMinimum();
  if (filtered && !dateInput.reportValidity()) return;
  const session = ++bookingSession;
  bookingFilters = filtered ? { specialtyId: Number(specialtySelect.value), locationId: Number(locationSelect.value) }
    : { specialtyId: 0, locationId: 0 };
  bookingDate.value = filtered && dateInput.value ? dateInput.value : bookingDate.min;
  clearSlots();
  if (!dialog.open) dialog.showModal();
  if (!await loadReferenceData() || session !== bookingSession || !dialog.open) return;
  updateDoctorChoices();
  await doctorChanged();
}

document.querySelectorAll('[data-book]').forEach((button) => button.addEventListener('click', () => openBooking()));
retryData.addEventListener('click', async () => {
  const session = bookingSession;
  if (await loadReferenceData(true) && session === bookingSession && dialog.open) {
    updateDoctorChoices();
    await doctorChanged();
  }
});
showAllDoctors.addEventListener('click', async () => {
  bookingFilters = { specialtyId: 0, locationId: 0 };
  updateDoctorChoices();
  await doctorChanged();
});
nextAvailable.addEventListener('click', async () => {
  const version = ++calendarVersion;
  slotsController?.abort();
  slotsController = new AbortController();
  nextAvailable.disabled = true;
  try {
    const query = new URLSearchParams({ from: bookingDate.value });
    if (serviceSelect.value) query.set('medicalServiceId', serviceSelect.value);
    const slot = await apiRequest(`/api/doctors/${doctorSelect.value}/next-slot?${query}`, { signal: slotsController.signal });
    if (version !== calendarVersion) return;
    if (!slot) {
      slotMessage.textContent = 'Nessun orario libero nei prossimi 28 giorni. Scegli un altro medico o contatta la clinica.';
      return;
    }
    bookingDate.value = clinicDayFormat.format(new Date(slot.startsAt));
    const expectedVersion = calendarVersion + 1;
    await loadSlots();
    if (calendarVersion !== expectedVersion) return;
    if ([...slotSelect.options].some((x) => x.value === slot.startsAt)) slotSelect.value = slot.startsAt;
  } catch (error) {
    if (error.name !== 'AbortError' && version === calendarVersion) slotMessage.textContent = error.message;
  } finally {
    nextAvailable.disabled = false;
  }
});

// Il dialog può essere chiuso dal pulsante X oppure cliccando sullo sfondo.
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  bookingSession++;
  calendarVersion++;
  doctorVersion++;
  slotsController?.abort();
  servicesController?.abort();
  clearSlots();
  serviceSelect.replaceChildren(new Option('Visita standard del turno', ''));
  form.reset();
  form.hidden = false;
  errorMessage.hidden = true;
  dialog.querySelector('.success-message').hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || referenceState !== 'ready' || doctorSelect.disabled || !form.reportValidity()) return;
  submitting = true;
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
    const doctor = doctors.find((item) => item.id === payload.doctorId);
    document.querySelector('#bookingSummary').textContent = `${doctor?.fullName || 'Medico'} · ${doctor?.location || ''} · ${new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full' }).format(new Date(payload.appointmentDate))} alle ${clinicTimeFormat.format(new Date(payload.appointmentDate))} (ora di Roma).`;
    form.hidden = true;
    dialog.querySelector('.success-message').hidden = false;
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    await loadSlots();
  } finally {
    submitting = false;
    submitButton.disabled = referenceState !== 'ready' || doctorSelect.disabled;
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

// La ricerca e i pulsanti generici usano lo stesso caricamento affidabile.
document.querySelector('#findVisit').addEventListener('click', () => openBooking(true));

document.querySelector('[data-open-search]').addEventListener('click', () => specialtySelect.focus());
document.querySelector('#shopButton').addEventListener('click', () => alert('Il catalogo viene gestito nel database ed è in preparazione.'));

// Impedisce al browser di proporre date passate e carica i dati iniziali.
function refreshDateMinimum() {
  bookingDate.min = clinicDate();
  document.querySelector('#date').min = bookingDate.min;
}
refreshDateMinimum();
loadReferenceData();
