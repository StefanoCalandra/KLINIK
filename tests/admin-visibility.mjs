import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { authenticateContext } from './admin-auth.mjs';
const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true });
const setup = await browser.newContext();
await authenticateContext(setup, base);
const patient = await browser.newContext();
const cleanup = [];
async function create(path, data, context = setup) {
  const response = await context.request.post(base+path, { data });
  assert.equal(response.status(), 201, await response.text());
  const { id } = await response.json();
  cleanup.push(`${path}/${id}`);
  return id;
}
try {
  const name = `Agenda visibility ${Date.now()}`;
  const specialtyId = await create('/api/specialties', { name });
  const locationId = await create('/api/locations', { name });
  const doctorId = await create('/api/doctors', { fullName: name, specialtyId, locationId, isAvailable: true });
  for (let day = 0; day < 7; day++) await create('/api/doctor-schedules', { doctorId, dayOfWeek: day,
    startTime: '09:00:00', endTime: '12:00:00', slotDurationMinutes: 30, isActive: true });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  function offset(days) { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+days); return date.toISOString().slice(0, 10); }
  const ids = [];
  for (const days of [14, 35]) {
    const slots = await (await patient.request.get(`${base}/api/doctors/${doctorId}/slots?date=${offset(days)}`)).json();
    ids.push(await create('/api/appointments', { patientName: `${name} +${days}`, phone: '000', doctorId, appointmentDate: slots[0].startsAt }, patient));
  }
  for (const timezoneId of ['Europe/Rome', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId });
    await authenticateContext(context, base);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/admin.html`);
      await page.waitForFunction(() => !document.querySelector('#tableWrap').hidden);
      assert.equal(await page.locator('#from').inputValue(), '');
      assert.equal(await page.locator('#to').inputValue(), '');
      for (const id of ids) assert.equal(await page.locator(`#visits tr[data-id="${id}"]`).count(), 1,
        'A public booking outside seven days must be visible immediately');
      const firstId = Number(await page.locator('#visits tr').first().getAttribute('data-id'));
      assert.equal(firstId, ids[1], 'Newest request must appear first');
      async function requestAfter(action) {
        const response = page.waitForResponse(r => r.url().includes('/api/admin/appointments?') && r.status() === 200);
        await action();
        await response;
        await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-busy') === 'false');
      }
      await page.locator('#from').fill(today);
      await page.locator('#to').fill(offset(6));
      await page.locator('#doctor').selectOption(String(doctorId));
      await requestAfter(() => page.locator('#filters button[type=submit]').click());
      assert.equal(await page.locator('#total').textContent(), '0');
      assert.equal(await page.locator('#empty').isVisible(), true);
      await requestAfter(() => page.locator('#allDates').click());
      assert.equal(await page.locator('#total').textContent(), '2');
      assert.match(await page.locator('#filterScope').textContent(), /Tutte le date/);
      await page.locator('#status').selectOption('Confermata');
      await requestAfter(() => page.locator('#filters button[type=submit]').click());
      assert.equal(await page.locator('#total').textContent(), '0');
      await requestAfter(() => page.locator('#showPending').click());
      assert.equal(await page.locator('#from').inputValue(), '');
      assert.equal(await page.locator('#to').inputValue(), '');
      assert.equal(await page.locator('#status').inputValue(), 'In attesa');
      for (const id of ids) assert.equal(await page.locator(`#visits tr[data-id="${id}"]`).count(), 1);
      await page.locator('#search').fill(`AUR-${String(ids[1]).padStart(6,'0')}`);
      await requestAfter(() => page.locator('#filters button[type=submit]').click());
      assert.equal(await page.locator('#total').textContent(), '1');
      assert.equal(await page.locator(`#visits tr[data-id="${ids[1]}"]`).count(), 1);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('Agenda visibility OK: prenotazioni pubbliche a +14/+35 giorni visibili subito, ordine recente, filtri, tutte le date, in attesa e mobile.');
} finally {
  const failures = [];
  for (const path of cleanup.reverse()) {
    const response = await setup.request.delete(base+path);
    if (![204,404].includes(response.status())) failures.push(`${path}: ${response.status()}`);
  }
  await browser.close();
  assert.deepEqual(failures, []);
}
