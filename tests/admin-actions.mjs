import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { authenticateContext } from './admin-auth.mjs';
const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true });
const setup = await browser.newContext();
await authenticateContext(setup, base);
const cleanup = [];
const checks = [];
async function create(path, data) {
  const response = await setup.request.post(base+path, { data });
  assert.equal(response.status(), 201, await response.text());
  const { id } = await response.json();
  cleanup.push(`${path}/${id}`);
  return id;
}
async function verify(id, expected, label) {
  const response = await setup.request.get(`${base}/api/appointments/${id}`);
  if (expected.deleted) assert.equal(response.status(), 404);
  else {
    assert.equal(response.status(), 200);
    const record = await response.json();
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'appointmentDate') assert.equal(new Date(record[key]).toISOString(), new Date(value).toISOString());
      else assert.equal(record[key], value, `${label}: ${key}`);
    }
  }
  // Hook facoltativo per una lettura SQL indipendente da HTTP/Entity Framework.
  // Il verificatore riceve solo l'id dei record sintetici e i risultati attesi.
  if (process.env.KLINIK_SQL_ASSERTOR) {
    const result = spawnSync(process.env.KLINIK_SQL_ASSERTOR_PYTHON ?? 'python3',
      [process.env.KLINIK_SQL_ASSERTOR, String(id), JSON.stringify(expected)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout || 'Verifica SQL fallita');
  }
  checks.push(label);
}
try {
  const name = `Admin actions ${Date.now()}`;
  const specialtyId = await create('/api/specialties', { name });
  const locationId = await create('/api/locations', { name });
  const doctorId = await create('/api/doctors', { fullName: name, specialtyId, locationId, isAvailable: true });
  for (let day = 0; day < 7; day++) await create('/api/doctor-schedules', { doctorId, dayOfWeek: day,
    startTime: '09:00:00', endTime: '13:00:00', slotDurationMinutes: 30, isActive: true });
  const date = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const slots = await (await setup.request.get(`${base}/api/doctors/${doctorId}/slots?date=${date}`)).json();
  const payload = { patientName: name, phone: '000', doctorId, appointmentDate: slots[0].startsAt, notes: 'Verifica amministrativa' };
  const id = await create('/api/appointments', payload);
  await verify(id, { status: 'In attesa' }, 'Richiesta registrata');
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.delete(`${base}/api/appointments/${id}`)).status(), 401);
  await anonymous.close();
  await verify(id, { status: 'In attesa' }, 'Eliminazione anonima negata');
  const page = await setup.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin.html`);
  await page.waitForFunction(() => !document.querySelector('#adminMain').hidden);
  await page.locator('#search').fill(`AUR-${String(id).padStart(6,'0')}`);
  await page.locator('#filters button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#total').textContent === '1');
  const row = page.locator(`#visits tr[data-id="${id}"]`);
  await row.getByRole('button', { name: 'Conferma', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#confirmed').textContent === '1');
  await verify(id, { status: 'Confermata' }, 'Conferma dalla pagina');
  async function statusFromDetails(status) {
    await row.getByRole('button', { name: /Dettagli/ }).click();
    await page.locator('#detailStatus').selectOption(status);
    await page.locator('#saveStatus').click();
    await page.waitForFunction(() => !document.querySelector('#details').open);
    await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-busy') === 'false');
  }
  await statusFromDetails('Completata');
  await verify(id, { status: 'Completata' }, 'Cambio stato dalla pagina');
  assert.equal((await setup.request.post(`${base}/api/appointments/${id}/cancel`)).status(), 409);
  await verify(id, { status: 'Completata' }, 'Annullamento visita completata rifiutato');
  await statusFromDetails('In attesa');
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#otherCounts').textContent.includes('1 annullate'));
  await verify(id, { status: 'Annullata' }, 'Annullamento: storico conservato');
  const released = await (await setup.request.get(`${base}/api/doctors/${doctorId}/slots?date=${date}`)).json();
  assert.ok(released.some(slot => slot.startsAt === slots[0].startsAt));
  await create('/api/appointments', { ...payload, patientName: `${name} secondo paziente` });
  await row.getByRole('button', { name: /Dettagli/ }).click();
  await page.locator('#detailStatus').selectOption('Confermata');
  await page.locator('#saveStatus').click();
  await page.waitForFunction(() => !document.querySelector('#detailError').hidden);
  await verify(id, { status: 'Annullata' }, 'Riattivazione in conflitto rifiutata');
  await page.locator('#closeDetails').click();
  // Dati e data: funzione disponibile nel backend, non nel pannello corrente.
  const updated = { ...payload, patientName: `${name} modificato`, phone: '000123',
    notes: 'Modifica verificata nel database', appointmentDate: slots[1].startsAt, status: 'In attesa' };
  assert.equal((await setup.request.put(`${base}/api/appointments/${id}`, { data: updated })).status(), 204);
  await verify(id, { patientName: updated.patientName, phone: updated.phone, notes: updated.notes,
    appointmentDate: updated.appointmentDate, status: 'In attesa' }, 'Modifica dati e data tramite backend');
  await page.locator('#refresh').click();
  await page.waitForFunction((name) => document.querySelector('#visits').textContent.includes(name), updated.patientName);
  // Eliminazione definitiva: usa solo la prenotazione sintetica di questo test.
  assert.equal((await setup.request.delete(`${base}/api/appointments/${id}`)).status(), 204);
  await verify(id, { deleted: true }, 'Eliminazione definitiva tramite backend');
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#total').textContent === '0');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, directSql: !!process.env.KLINIK_SQL_ASSERTOR }));
} finally {
  const failures = [];
  for (const path of cleanup.reverse()) {
    const response = await setup.request.delete(base+path);
    if (![204,404].includes(response.status())) failures.push(`${path}: ${response.status()}`);
  }
  await browser.close();
  assert.deepEqual(failures, [], 'Pulizia dei record sintetici');
}
