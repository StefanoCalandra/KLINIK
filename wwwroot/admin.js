const $ = (id) => document.getElementById(id);
const filters = $('filters');
const dialog = $('details');
const dayFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const states = { 'In attesa': 'pending', Confermata: 'confirmed', Completata: 'completed', Annullata: 'cancelled', Assente: 'absent' };
let currentPage = 1;
let appliedFilters;
let controller;
let requestVersion = 0;
let visits = new Map();
let selected;
let saving = false;
let csrfToken = null;
let username = null;

function defaults() {
  $('from').value = '';
  $('to').value = '';
}
function updateScope() {
  const applied = new URLSearchParams(appliedFilters);
  const from = applied.get('from'), to = applied.get('to');
  $('totalLabel').textContent = from || to ? 'Visite nel periodo' : 'Richieste registrate';
  $('filterScope').textContent = from || to
    ? `Periodo visite: ${from ? dayFormat.format(new Date(`${from}T12:00:00Z`)) : 'qualsiasi data iniziale'} – ${to ? dayFormat.format(new Date(`${to}T12:00:00Z`)) : 'qualsiasi data finale'}.`
    : 'Tutte le date · Richieste ordinate dalla più recente.';
  $('allDates').hidden = !from && !to;
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
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}), ...options.headers } });
  if (response.ok) return response.status === 204 ? null : response.json();
  if (response.status === 401 && url !== '/api/admin/login') {
    await initializeSession();
    throw new Error('Sessione scaduta. Accedi nuovamente.');
  }
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
  $('empty').textContent = new URLSearchParams(appliedFilters).size
    ? 'Nessuna visita corrisponde ai filtri selezionati. Usa Tutte le richieste in attesa per cercare senza limiti di data.'
    : 'Non risultano richieste registrate. Se hai appena prenotato, verifica di aver ricevuto il codice di conferma AUR-… e aggiorna l’agenda.';
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
    updateScope();
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
  if ($('from').value && $('to').value && $('from').value > $('to').value) {
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
$('allDates').addEventListener('click', () => { defaults(); applyFilters(); });
$('showPending').addEventListener('click', () => {
  filters.reset();
  defaults();
  $('status').value = 'In attesa';
  applyFilters();
});
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
function showLogin(text = '') {
  ++requestVersion;
  controller?.abort();
  visits.clear();
  selected = null;
  $('visits').replaceChildren();
  $('detailFields').replaceChildren();
  $('detailTitle').textContent = 'Dettaglio visita';
  $('detailCode').textContent = '';
  filters.reset();
  appliedFilters = null;
  for (const id of ['total', 'pending', 'confirmed', 'completed']) $(id).textContent = '—';
  $('currentUsername').textContent = '';
  if (dialog.open) dialog.close();
  if ($('credentialsDialog').open) $('credentialsDialog').close();
  $('credentialsForm').reset();
  $('adminMain').hidden = true;
  $('accountActions').hidden = true;
  $('loginMain').hidden = false;
  $('loginPassword').value = '';
  message('loginError', text);
}
async function initializeSession() {
  try {
    const session = await api('/api/admin/session');
    csrfToken = session.csrfToken;
    username = session.username;
    $('loginSubmit').disabled = false;
    $('retryLogin').hidden = true;
    $('loginStatus').textContent = '';
    if (!session.authenticated) { showLogin(); return; }
    $('loginMain').hidden = true;
    $('adminMain').hidden = false;
    $('accountActions').hidden = false;
    $('currentUsername').textContent = username;
    if (!appliedFilters) {
      defaults();
      appliedFilters = [...new FormData(filters)].filter(([, value]) => value !== '');
    }
    await loadReferences();
    await loadVisits();
  } catch (error) {
    showLogin('Impossibile collegarsi alla clinica. Verifica che il backend sia avviato e riprova.');
    $('retryLogin').hidden = false;
    $('loginStatus').textContent = '';
  }
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!$('loginForm').reportValidity() || !csrfToken) return;
  $('loginSubmit').disabled = true;
  message('loginError', '');
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({
      username: $('loginUsername').value, password: $('loginPassword').value,
    }) });
    $('loginPassword').value = '';
    await initializeSession();
  } catch {
    message('loginError', 'Accesso non riuscito. Verifica username e password, poi riprova.');
  } finally { $('loginSubmit').disabled = false; }
});
$('retryLogin').addEventListener('click', initializeSession);
$('logout').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
    appliedFilters = null;
    await initializeSession();
    $('loginUsername').focus();
  } catch (error) { message('error', error.message); }
});
$('openCredentials').addEventListener('click', () => {
  $('credentialsForm').reset();
  $('newUsername').value = username;
  message('credentialsError', '');
  $('credentialsDialog').showModal();
});
$('closeCredentials').addEventListener('click', () => $('credentialsDialog').close());
$('credentialsDialog').addEventListener('close', () => $('credentialsForm').reset());
$('credentialsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!$('credentialsForm').reportValidity()) return;
  if ($('newPassword').value !== $('confirmPassword').value) {
    message('credentialsError', 'Le nuove password non coincidono.'); return;
  }
  $('saveCredentials').disabled = true;
  try {
    await api('/api/admin/credentials', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData($('credentialsForm')))) });
    $('credentialsDialog').close();
    await initializeSession();
    message('notice', 'Credenziali aggiornate. Le altre sessioni sono state disconnesse.');
  } catch (error) { message('credentialsError', error.message); }
  finally { $('saveCredentials').disabled = false; }
});
initializeSession();
