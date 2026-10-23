import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true,
});
const context = await browser.newContext({ timezoneId: 'Europe/Rome', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let appointmentId;
try {
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#bookingDoctor').options.length > 1);
  assert.ok(await page.locator('#doctorList article').count() > 0);
  const allDoctors = await page.locator('#bookingDoctor option').count();
  await page.locator('#specialty').selectOption({ index: 1 });
  await page.locator('#date').fill(await page.locator('#date').getAttribute('min'));
  await page.locator('#findVisit').click();
  assert.ok(await page.locator('#bookingDate').inputValue() >= await page.locator('#bookingDate').getAttribute('min'));
  await page.locator('.dialog-close').click();
  await page.locator('[data-book]').first().click();
  assert.equal(await page.locator('#bookingDoctor option').count(), allDoctors,
    'Generic booking must restore all doctors after a filtered search');
  await page.locator('#bookingForm').evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
  assert.equal(await page.locator('#bookingForm button[type=submit]').isEnabled(), true,
    'Invalid dates must not leave the submit button disabled');

  await page.locator('[name="patientName"]').fill('Browser Smoke Test');
  await page.locator('[name="phone"]').fill('+39 000 000000');
  await page.locator('#bookingDoctor').selectOption({ index: 1 });
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) + 'T12:00';
  await page.locator('#bookingDate').fill(date);
  await page.route('**/api/appointments', (route) => route.fulfill({
    status: 409, contentType: 'application/problem+json',
    body: JSON.stringify({ title: 'Conflitto', detail: 'Questo orario non è più disponibile.' }),
  }));
  await page.locator('#bookingForm button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.form-error').hidden);
  assert.match(await page.locator('.form-error').textContent(), /orario non è più disponibile/);
  assert.equal(await page.locator('#bookingForm button[type=submit]').isEnabled(), true);
  await page.unroute('**/api/appointments');
  const responsePromise = page.waitForResponse((res) => res.url().endsWith('/api/appointments') && res.request().method() === 'POST');
  await page.locator('#bookingForm button[type=submit]').click();
  const response = await responsePromise;
  assert.equal(response.status(), 201, await response.text());
  appointmentId = (await response.json()).id;
  await page.waitForFunction(() => !document.querySelector('.success-message').hidden);
  assert.match(await page.locator('#bookingReference').textContent(), /^AUR-\d+$/);
  const booking = await (await context.request.get(`${base}/api/appointments/${appointmentId}`)).json();
  const expectedUtc = await page.evaluate((value) => new Date(value).toISOString(), date);
  assert.equal(new Date(booking.appointmentDate).toISOString(), expectedUtc);
  await page.locator('.dialog-close').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.menu-btn').click();
  assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'true');
  await page.locator('.desktop-nav a').first().click();
  assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'false');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Mobile layout must not scroll horizontally');
  assert.deepEqual(errors, []);
  console.log('Browser OK: data loading, filters, booking error and success, UTC time, mobile menu and layout.');
} finally {
  if (appointmentId) {
    const response = await context.request.delete(`${base}/api/appointments/${appointmentId}`);
    assert.equal(response.status(), 204);
  }
  await browser.close();
}
