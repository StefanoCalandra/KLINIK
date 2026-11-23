import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true,
});
const setup = await browser.newContext();
const cleanup = [];
async function create(path, payload) {
  const response = await setup.request.post(base + path, { data: payload });
  assert.equal(response.status(), 201, await response.text());
  const { id } = await response.json();
  cleanup.push(`${path}/${id}`);
  return id;
}
try {
  const name = `Browser ${Date.now()}`;
  const specialtyId = await create('/api/specialties', { name });
  const locationId = await create('/api/locations', { name });
  const doctorId = await create('/api/doctors', { fullName: name, specialtyId, locationId, isAvailable: true });
  const medicalServiceId = await create('/api/medical-services', {
    name, specialtyId, durationMinutes: 45, price: 50, isActive: true,
  });
  assert.equal((await setup.request.put(`${base}/api/medical-services/${medicalServiceId}/doctors/${doctorId}`)).status(), 204);
  // Eliminare il collegamento prima della prestazione, dopo le prenotazioni.
  cleanup.push(`/api/medical-services/${medicalServiceId}/doctors/${doctorId}`);
  const future = new Date(Date.now() + 14 * 86400000);
  const date = future.toISOString().slice(0, 10);
  await create('/api/doctor-schedules', { doctorId, dayOfWeek: future.getUTCDay(), startTime: '09:00:00',
    endTime: '13:00:00', slotDurationMinutes: 30, isActive: true });

  for (const timezoneId of ['Europe/Rome', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const initialApiRequests = [];
    page.on('request', (request) => { if (request.url().includes('/api/')) initialApiRequests.push(new URL(request.url()).pathname); });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector('#bookingDoctor').options.length > 1);
      assert.ok(await page.locator('#doctorList article').count() > 0);
      assert.deepEqual(initialApiRequests, ['/api/reference-data'], 'Initial data must use one request');
      const allDoctors = await page.locator('#bookingDoctor option').count();
      await page.locator('#specialty').selectOption(String(specialtyId));
      await page.locator('#date').fill(date);
      await page.locator('#findVisit').click();
      assert.equal(await page.locator('#bookingDate').inputValue(), date);
      await page.locator('.dialog-close').click();
      await page.locator('[data-book]').first().click();
      assert.equal(await page.locator('#bookingDoctor option').count(), allDoctors);
      await page.locator('#bookingForm').evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
      assert.equal(await page.locator('#bookingForm button[type=submit]').isEnabled(), true);

      await page.locator('[name="patientName"]').fill('Browser Smoke Test');
      await page.locator('[name="phone"]').fill('+39 000 000000');
      await page.locator('#bookingDate').fill(date);
      await page.locator('#bookingDoctor').selectOption(String(doctorId));
      await page.waitForFunction((id) => [...document.querySelector('#bookingService').options].some((o) => o.value === id), String(medicalServiceId));
      await page.locator('#bookingService').selectOption(String(medicalServiceId));
      await page.waitForFunction(() => document.querySelector('#bookingSlot').options.length > 1);
      const selected = await page.locator('#bookingSlot option').nth(1).getAttribute('value');
      const label = await page.locator('#bookingSlot option').nth(1).textContent();
      assert.match(label, /09:00.*09:45.*45 min/);
      await page.locator('#bookingSlot').selectOption(selected);
      await page.route('**/api/appointments', (route) => route.fulfill({
        status: 409, contentType: 'application/problem+json',
        body: JSON.stringify({ detail: 'Questo orario non è più disponibile.' }),
      }));
      await page.locator('#bookingForm button[type=submit]').click();
      await page.waitForFunction(() => !document.querySelector('.form-error').hidden);
      assert.match(await page.locator('.form-error').textContent(), /orario non è più disponibile/);
      await page.waitForFunction(() => document.querySelector('#bookingSlot').options.length > 1);
      assert.equal(await page.locator('#bookingSlot').inputValue(), '', 'Conflict must require a fresh choice');
      await page.unroute('**/api/appointments');
      await page.locator('#bookingSlot').selectOption(selected);
      const responsePromise = page.waitForResponse((res) => res.url().endsWith('/api/appointments') && res.request().method() === 'POST');
      await page.locator('#bookingForm button[type=submit]').click();
      const response = await responsePromise;
      assert.equal(response.status(), 201, await response.text());
      const appointmentId = (await response.json()).id;
      cleanup.push(`/api/appointments/${appointmentId}`);
      await page.waitForFunction(() => !document.querySelector('.success-message').hidden);
      assert.match(await page.locator('#bookingReference').textContent(), /^AUR-\d+$/);
      const booking = await (await context.request.get(`${base}/api/appointments/${appointmentId}`)).json();
      assert.equal(new Date(booking.appointmentDate).toISOString(), new Date(selected).toISOString());
      assert.equal(booking.durationMinutes, 45);
      assert.equal(booking.medicalServiceId, medicalServiceId);
      assert.equal((await context.request.delete(`${base}/api/appointments/${appointmentId}`)).status(), 204);
      cleanup.pop();
      await page.locator('.dialog-close').click();

      // Nessun turno il giorno successivo: nessun orario inventato nel modulo.
      await page.locator('[data-book]').first().click();
      await page.locator('#bookingDoctor').selectOption(String(doctorId));
      await page.locator('#bookingDate').fill(new Date(future.getTime() + 86400000).toISOString().slice(0, 10));
      await page.locator('#bookingDate').dispatchEvent('change');
      await page.waitForFunction(() => document.querySelector('#slotMessage').textContent.includes('Nessuna disponibilità'));
      assert.equal(await page.locator('#bookingSlot option').count(), 1);
      await page.locator('.dialog-close').click();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.menu-btn').click();
      assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'true');
      await page.locator('.desktop-nav a').first().click();
      assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'false');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('Browser OK: slot reali, prestazioni, conflitti, assenza di turni, UTC/Roma/New York, navigazione mobile.');
} finally {
  for (const path of cleanup.reverse()) {
    const response = await setup.request.delete(base + path);
    assert.ok([204, 404].includes(response.status()), `${path}: ${response.status()}`);
  }
  await browser.close();
}
