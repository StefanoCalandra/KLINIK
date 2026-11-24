const $ = (id) => document.getElementById(id);
const filters = $('filters');
const dialog = $('details');
const dayFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const states = { 'In attesa': 'pending', Confermata: 'confirmed', Completata: 'completed', Annullata: 'cancelled', Assente: 'absent' };
let currentPage = 1;
let appliedFilters;
let controller;
let requestVersion = 0;
let visits = new Map();
let selected;
let saving = false;

function defaults() {
  const today = isoDayFormat.format(new Date());
  $('from').value = today;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  $('to').value = end.toISOString().slice(0, 10);
}
function message(id, text) {
  $(id).textContent = text;
  $(id).hidden = !text;
}
function code(id) { return `AUR-${String(id).padStart(6, '0')}`; }
function period(visit) {
  const start = new Date(visit.appointmentDate);
  const end = new Date(start.getTime() + visit.durationMinutes * 60000);
  return `${timeFormat.format(start)} – ${timeFormat.format(end)}`;
}
async function api(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.ok) return response.status === 204 ? null : response.json();
  const problem = await response.json().catch(() => ({}));
  throw new Error((problem.errors && Object.values(problem.errors).flat().join(' '))
    || problem.detail || problem.message || 'Operazione non riuscita. Premi Aggiorna agenda per riprovare.');
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function cell(primary, secondary) {
  const node = element('td');
  node.append(element('strong', primary), element('small', secondary));
  return node;
}
function action(text, callback, className = 'secondary') {
  const button = element('button', text, `button ${className}`);
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}
function render(items) {
  const fragment = document.createDocumentFragment();
  visits = new Map(items.map((visit) => [visit.id, visit]));
  for (const visit of items) {
    const row = element('tr');
    row.dataset.id = visit.id;
    const date = cell(dayFormat.format(new Date(visit.appointmentDate)), `${period(visit)} · ${code(visit.id)}`);
    date.className = 'code';
    row.append(date, cell(visit.patientName, visit.phone), cell(visit.doctor, `${visit.medicalService} · ${visit.durationMinutes} min`),
      cell(visit.location, [visit.address, visit.city].filter(Boolean).join(' · ')));
    const status = element('td');
    status.append(element('span', visit.status, `badge ${states[visit.status] || ''}`));
    row.append(status);
    const actions = element('td');
    const group = element('div', null, 'actions');
    const detailButton = action('Dettagli →', () => openDetails(visit.id));
    detailButton.setAttribute('aria-label', `Dettagli di ${visit.patientName}, ${code(visit.id)}`);
    group.append(detailButton);
    if (visit.status === 'In attesa') group.append(action('Conferma', () => changeStatus(visit, 'Confermata'), 'primary'));
    if (!['Annullata', 'Completata'].includes(visit.status))
      group.append(action('Annulla', () => changeStatus(visit, 'Annullata'), 'secondary cancel'));
    actions.append(group);
    row.append(actions);
    fragment.append(row);
  }
  $('visits').replaceChildren(fragment);
  $('tableWrap').hidden = !items.length;
  $('empty').hidden = !!items.length;
}
async function loadVisits() {
  const version = ++requestVersion;
  controller?.abort();
  controller = new AbortController();
  message('error', '');
  $('results').setAttribute('aria-busy', 'true');
  $('loading').hidden = false;
  $('tableWrap').hidden = true;
  $('empty').hidden = true;
  $('previous').disabled = true;
  $('next').disabled = true;
  try {
    const query = new URLSearchParams(appliedFilters);
    query.set('page', currentPage);
    query.set('pageSize', $('pageSize').value);
    const data = await api(`/api/admin/appointments?${query}`, { signal: controller.signal });
    if (version !== requestVersion) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (currentPage > lastPage) {
      currentPage = lastPage;
      return await loadVisits();
    }
    render(data.items);
    for (const id of ['total', 'pending', 'confirmed', 'completed'])
      $(id).textContent = id === 'total' ? data.total : data.summary[id];
    $('otherCounts').textContent = `${data.summary.cancelled} annullate · ${data.summary.absent} assenti`;
    const start = data.total ? (currentPage - 1) * data.pageSize + 1 : 0;
    $('range').textContent = `${start}–${Math.min(currentPage * data.pageSize, data.total)} di ${data.total} visite · Pagina ${currentPage} di ${lastPage}`;
    $('previous').disabled = currentPage === 1;
    $('next').disabled = currentPage >= lastPage;
    $('updated').textContent = `Aggiornata alle ${timeFormat.format(new Date())}`;
  } catch (error) {
    if (error.name === 'AbortError' || version !== requestVersion) return;
    message('error', error.message);
    $('range').textContent = 'Agenda non caricata';
    for (const id of ['total', 'pending', 'confirmed', 'completed']) $(id).textContent = '—';
    $('otherCounts').textContent = '—';
  } finally {
    if (version === requestVersion) {
      $('loading').hidden = true;
      $('results').setAttribute('aria-busy', 'false');
    }
  }
}
function applyFilters() {
  if (!filters.reportValidity()) return;
  if ($('from').value > $('to').value) {
    message('error', 'La data finale deve essere uguale o successiva a quella iniziale.');
    return;
  }
  appliedFilters = [...new FormData(filters)].filter(([, value]) => value !== '');
  currentPage = 1;
  message('notice', '');
  loadVisits();
}
function openDetails(id) {
  selected = visits.get(id);
  if (!selected || saving) return;
  $('detailCode').textContent = code(selected.id);
  $('detailTitle').textContent = selected.patientName;
  $('detailStatus').value = selected.status;
  const fields = [
    ['Data', dayFormat.format(new Date(selected.appointmentDate))], ['Orario (Roma)', period(selected)],
    ['Medico', selected.doctor], ['Specialità', selected.specialty],
    ['Prestazione', `${selected.medicalService} · ${selected.durationMinutes} minuti`], ['Stato', selected.status],
    ['Telefono', selected.phone], ['Email', selected.email || 'Non indicata'],
    ['Sede', [selected.location, selected.address, selected.city].filter(Boolean).join('\n'), true],
    ['Note', selected.notes || 'Nessuna nota', true],
    ['Richiesta registrata il', `${dayFormat.format(new Date(selected.createdAt))} alle ${timeFormat.format(new Date(selected.createdAt))}`, true],
  ];
  $('detailFields').replaceChildren(...fields.map(([title, value, wide]) => {
    const entry = element('div', null, wide ? 'wide' : '');
    entry.append(element('dt', title), element('dd', value));
    return entry;
  }));
  message('detailError', '');
  dialog.showModal();
}
async function changeStatus(visit, status) {
  if (saving || status === visit.status) return;
  if (status === 'Annullata' && !window.confirm(`Annullare la visita ${code(visit.id)} di ${visit.patientName}? Lo storico verrà conservato.`)) return;
  saving = true;
  const targets = [...document.querySelectorAll('.actions button, #saveStatus, #detailStatus')];
  targets.forEach((control) => { control.disabled = true; });
  message('detailError', '');
  message('notice', '');
  try {
    await api(`/api/appointments/${visit.id}${status === 'Annullata' ? '/cancel' : '/status'}`, {
      method: status === 'Annullata' ? 'POST' : 'PUT',
      ...(status === 'Annullata' ? {} : { body: JSON.stringify({ status }) }),
    });
    if (dialog.open) dialog.close();
    message('notice', `${code(visit.id)} · Stato aggiornato: ${status}.`);
    await loadVisits();
  } catch (error) {
    message(dialog.open ? 'detailError' : 'error', error.message);
  } finally {
    saving = false;
    targets.forEach((control) => { control.disabled = false; });
  }
}
filters.addEventListener('submit', (event) => { event.preventDefault(); applyFilters(); });
$('reset').addEventListener('click', () => { filters.reset(); defaults(); applyFilters(); });
$('refresh').addEventListener('click', () => loadVisits());
$('previous').addEventListener('click', () => { --currentPage; loadVisits(); });
$('next').addEventListener('click', () => { ++currentPage; loadVisits(); });
$('pageSize').addEventListener('change', () => { currentPage = 1; loadVisits(); });
$('closeDetails').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
$('saveStatus').addEventListener('click', () => changeStatus(selected, $('detailStatus').value));
async function loadReferences() {
  const data = await api('/api/reference-data');
  $('doctor').replaceChildren(new Option('Tutti i medici', ''), ...data.doctors.map((doctor) => new Option(doctor.fullName, doctor.id)));
  $('location').replaceChildren(new Option('Tutte le sedi', ''), ...data.locations.map((location) => new Option(location.name, location.id)));
}
defaults();
appliedFilters = [...new FormData(filters)].filter(([, value]) => value !== '');
loadReferences().catch(() => message('error', 'Filtri medico e sede non caricati. Ricarica la pagina per riprovare.'));
loadVisits();
