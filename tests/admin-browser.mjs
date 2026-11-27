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
  const name = `Admin Browser ${Date.now()}`;
  const specialtyId = await create('/api/specialties', { name });
  const locationId = await create('/api/locations', { name, address: 'Via dei Test 24', city: 'Milano' });
  const doctorId = await create('/api/doctors', { fullName: name, specialtyId, locationId, isAvailable: true });
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await create('/api/doctor-schedules', { doctorId, dayOfWeek: new Date(`${date}T12:00Z`).getUTCDay(),
    startTime: '08:00:00', endTime: '22:00:00', slotDurationMinutes: 30, isActive: true });
  const slots = await (await setup.request.get(`${base}/api/doctors/${doctorId}/slots?date=${date}`)).json();
  assert.equal(slots.length, 28);
  const ids = [];
  for (let i = 0; i < 26; i++) ids.push(await create('/api/appointments', { patientName: `${name} ${i}`,
    phone: '+39 000 000000', email: 'admin-browser@example.test', doctorId, appointmentDate: slots[i].startsAt,
    notes: '<img src=x onerror="window.injected=true">' }));
  for (const timezoneId of ['Europe/Rome', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId, locale: 'it-IT', viewport: { width: 1440, height: 1000 } });
    await authenticateContext(context, base);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/admin.html`);
      await page.waitForFunction((id) => [...document.querySelector('#doctor').options].some(x => x.value === id), String(doctorId));
      await page.locator('#doctor').selectOption(String(doctorId));
      await page.locator('#from').fill(date);
      await page.locator('#to').fill(date);
      await page.locator('#filters button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#total').textContent === '26');
      assert.equal(await page.locator('#visits tr').count(), 25);
      if (timezoneId === 'Europe/Rome' && process.env.KLINIK_ADMIN_SCREENSHOT)
        await page.screenshot({ path: process.env.KLINIK_ADMIN_SCREENSHOT });
      assert.match(await page.locator('#visits tr').first().textContent(), /08:00 – 08:30/);
      assert.match(await page.locator('#visits tr').first().textContent(), /Via dei Test 24/);
      await page.locator('#next').click();
      await page.waitForFunction(() => document.querySelector('#range').textContent.includes('Pagina 2'));
      assert.equal(await page.locator('#visits tr').count(), 1);
      await page.locator('#previous').click();
      await page.waitForFunction(() => document.querySelectorAll('#visits tr').length === 25);
      await page.locator('#visits tr').first().getByRole('button', { name: /Dettagli/ }).click();
      assert.equal(await page.locator('#details').evaluate(x => x.open), true);
      assert.match(await page.locator('#detailFields').textContent(), /admin-browser@example.test/);
      assert.match(await page.locator('#detailFields').textContent(), /<img src=x/);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      await page.locator('#detailStatus').selectOption('Confermata');
      await page.locator('#saveStatus').click();
      await page.waitForFunction(() => !document.querySelector('#details').open);
      await page.waitForFunction(() => document.querySelector('#confirmed').textContent === '1');
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('#visits tr').first().getByRole('button', { name: 'Annulla', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#otherCounts').textContent.includes('1 annullate'));
      const stored = await (await context.request.get(`${base}/api/appointments/${ids[0]}`)).json();
      assert.equal(stored.status, 'Annullata');
      await page.locator('#status').selectOption('Annullata');
      await page.locator('#filters button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#total').textContent === '1');
      assert.equal(await page.locator('#visits tr').count(), 1);
      // Ripristino per il giro nel secondo fuso.
      assert.equal((await context.request.put(`${base}/api/appointments/${ids[0]}/status`, { data: { status: 'In attesa' } })).status(), 204);
      await page.locator('#status').selectOption('');
      await page.locator('#search').fill('Nessun paziente con questo nome');
      await page.locator('#filters button[type=submit]').click();
      await page.waitForFunction(() => !document.querySelector('#empty').hidden);
      assert.equal(await page.locator('#total').textContent(), '0');
      await page.locator('#search').fill('');
      await page.route('**/api/admin/appointments?*', route => route.fulfill({ status: 503,
        contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Agenda temporaneamente non disponibile.' }) }));
      await page.locator('#filters button[type=submit]').click();
      await page.waitForFunction(() => !document.querySelector('#error').hidden);
      assert.match(await page.locator('#error').textContent(), /temporaneamente non disponibile/);
      await page.unroute('**/api/admin/appointments?*');
      await page.locator('#refresh').click();
      await page.waitForFunction(() => document.querySelector('#total').textContent === '26');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const detailButton = page.locator('#visits tr').first().getByRole('button', { name: /Dettagli/ });
      await detailButton.click();
      assert.ok(await page.locator('#details').evaluate(x => x.scrollWidth <= x.clientWidth));
      await page.locator('#closeDetails').click();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('Admin OK: pagina separata, filtri, 26 visite paginate, dettagli sicuri, conferma/annullamento, errori, mobile e fusi orari.');
} finally {
  const failures = [];
  for (const path of cleanup.reverse()) {
    const response = await setup.request.delete(base + path);
    if (![204, 404].includes(response.status())) failures.push(`${path}: ${response.status()}`);
  }
  await browser.close();
  assert.deepEqual(failures, [], 'Pulizia dei dati admin');
}
