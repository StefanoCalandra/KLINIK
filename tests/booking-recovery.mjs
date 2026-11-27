import assert from 'node:assert/strict';
import { authenticateContext } from './admin-auth.mjs';
import { chromium } from 'playwright-core';
const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true });
const setup = await browser.newContext();
await authenticateContext(setup, base);
const cleanup = [];
async function create(path, data) {
  const response = await setup.request.post(base + path, { data });
  assert.equal(response.status(), 201, await response.text());
  const { id } = await response.json();
  cleanup.push(`${path}/${id}`);
  return id;
}
try {
  const suffix = Date.now();
  const specialtyId = await create('/api/specialties', { name: `Recovery ${suffix}` });
  const emptySpecialty = await create('/api/specialties', { name: `No doctors ${suffix}` });
  const locationId = await create('/api/locations', { name: `Recovery site ${suffix}`, city: 'Milano' });
  const doctorId = await create('/api/doctors', { fullName: `Recovery doctor ${suffix}`, specialtyId, locationId, isAvailable: true });
  await create('/api/doctor-schedules', { doctorId, dayOfWeek: 1, startTime: '09:00:00',
    endTime: '13:00:00', slotDurationMinutes: 30, isActive: true });
  const saturday = new Date(Date.now() + 7 * 86400000);
  while (saturday.getUTCDay() !== 6) saturday.setUTCDate(saturday.getUTCDate() + 1);
  const saturdayDate = saturday.toISOString().slice(0, 10);
  const monday = new Date(saturday.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  // Apertura prima che il database abbia risposto: il menu si popola alla risposta.
  const context = await browser.newContext({ timezoneId: 'Europe/Rome' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/reference-data', async route => { await gate; await route.continue(); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-book]').first().click();
  assert.equal(await page.locator('#bookingDoctor').isDisabled(), true);
  assert.match(await page.locator('#bookingDataStatus').textContent(), /Caricamento/);
  release();
  await page.waitForFunction((id) => [...document.querySelector('#bookingDoctor').options].some(x => x.value === id), String(doctorId));
  await page.locator('[name=patientName]').fill('Booking Recovery Test');
  await page.locator('[name=phone]').fill('+39 000 000000');
  await page.locator('#bookingDoctor').selectOption(String(doctorId));
  await page.locator('#bookingDate').fill(saturdayDate);
  await page.locator('#bookingDate').dispatchEvent('change');
  await page.waitForFunction(() => !document.querySelector('#nextAvailable').hidden);
  await page.locator('#nextAvailable').click();
  await page.waitForFunction((date) => document.querySelector('#bookingDate').value === date
    && document.querySelector('#bookingSlot').value !== '', monday);
  assert.match(await page.locator('#bookingSlot option:checked').textContent(), /09:00/);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/appointments') && response.request().method() === 'POST');
  await page.locator('#bookingForm button[type=submit]').click();
  const response = await responsePromise;
  assert.equal(response.status(), 201, await response.text());
  const { id } = await response.json();
  cleanup.push(`/api/appointments/${id}`);
  await page.waitForFunction(() => !document.querySelector('.success-message').hidden);
  assert.match(await page.locator('#bookingSummary').textContent(), /Recovery doctor/);
  // Verifica del record realmente salvato e della sua presenza nell'agenda admin.
  const stored = await (await setup.request.get(`${base}/api/appointments/${id}`)).json();
  assert.equal(stored.doctorId, doctorId);
  assert.equal(stored.patientName, 'Booking Recovery Test');
  await authenticateContext(context, base);
  const admin = await context.newPage();
  await admin.goto(`${base}/admin.html`);
  await admin.locator('#from').fill(monday);
  await admin.locator('#to').fill(monday);
  await admin.locator('#search').fill(`AUR-${String(id).padStart(6, '0')}`);
  await admin.locator('#filters button[type=submit]').click();
  await admin.waitForFunction(() => document.querySelector('#total').textContent === '1');
  assert.match(await admin.locator('#visits').textContent(), /Booking Recovery Test/);
  assert.deepEqual(errors, []);
  await context.close();

  // Procedura aggregata mancante: recupero dai tre endpoint compatibili.
  const fallback = await browser.newContext();
  const legacy = await fallback.newPage();
  await legacy.route('**/api/reference-data', route => route.fulfill({ status: 500, contentType: 'text/html', body: 'Old server' }));
  await legacy.goto(base);
  await legacy.locator('[data-book]').first().click();
  await legacy.waitForFunction((id) => [...document.querySelector('#bookingDoctor').options].some(x => x.value === id), String(doctorId));
  assert.equal(await legacy.locator('#bookingDoctor').isDisabled(), false);
  await fallback.close();

  // Disservizio reale: errore visibile e riprova senza perdere i dati inseriti.
  const outage = await browser.newContext();
  const retry = await outage.newPage();
  await retry.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/problem+json',
    body: JSON.stringify({ detail: 'Database temporaneamente non disponibile.' }) }));
  await retry.goto(base);
  await retry.locator('[data-book]').first().click();
  await retry.waitForFunction(() => !document.querySelector('#retryBookingData').hidden);
  assert.match(await retry.locator('#bookingDataStatus').textContent(), /Impossibile caricare/);
  assert.equal(await retry.locator('#bookingForm button[type=submit]').isDisabled(), true);
  await retry.locator('[name=patientName]').fill('Keep this name');
  await retry.unroute('**/api/**');
  await retry.locator('#retryBookingData').click();
  await retry.waitForFunction((id) => [...document.querySelector('#bookingDoctor').options].some(x => x.value === id), String(doctorId));
  assert.equal(await retry.locator('[name=patientName]').inputValue(), 'Keep this name');
  await retry.locator('.dialog-close').click();
  await retry.locator('#specialty').selectOption(String(emptySpecialty));
  await retry.locator('#location').selectOption(String(locationId));
  await retry.locator('#date').fill(saturdayDate);
  await retry.locator('#findVisit').click();
  await retry.waitForFunction(() => !document.querySelector('#showAllDoctors').hidden);
  assert.match(await retry.locator('#bookingDataStatus').textContent(), /Nessun medico corrisponde/);
  await retry.locator('#showAllDoctors').click();
  await retry.waitForFunction((id) => [...document.querySelector('#bookingDoctor').options].some(x => x.value === id), String(doctorId));
  assert.equal(await retry.locator('#bookingDoctor').isDisabled(), false);
  await outage.close();
  console.log('Booking recovery OK: caricamento lento, fallback, errore/riprova, filtri senza medici, sabato→lunedì, SQL e agenda admin.');
} finally {
  const failures = [];
  for (const path of cleanup.reverse()) {
    const response = await setup.request.delete(base + path);
    if (![204, 404].includes(response.status())) failures.push(`${path}: ${response.status()}`);
  }
  await browser.close();
  assert.deepEqual(failures, [], 'Pulizia dati di prenotazione');
}
