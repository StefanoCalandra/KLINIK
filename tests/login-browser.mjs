import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { authenticateContext } from './admin-auth.mjs';
const base = process.env.KLINIK_API_URL ?? 'http://127.0.0.1:5043';
const original = { username: process.env.KLINIK_ADMIN_USERNAME ?? 'admin', password: process.env.KLINIK_ADMIN_PASSWORD ?? 'admin' };
const changed = { username: 'admin-ui-change', password: 'Temporary UI password 42!' };
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true });
let accountChanged = false;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  for (const width of [1440, 1024, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const entry = page.locator('.site-header a[href="admin.html"]');
    assert.equal(await entry.isVisible(), true, 'Admin button must stay visible at the top');
    assert.ok(await entry.evaluate(x => { const box = x.getBoundingClientRect(); return box.top >= 0 && box.right <= innerWidth; }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.locator('.site-header a[href="admin.html"]').click();
  await page.waitForFunction(() => !document.querySelector('#loginSubmit').disabled);
  assert.equal(await page.locator('#adminMain').isHidden(), true);
  assert.equal((await context.request.get(`${base}/api/appointments`)).status(), 401);
  async function login(credentials) {
    await page.locator('#loginUsername').fill(credentials.username);
    await page.locator('#loginPassword').fill(credentials.password);
    await page.locator('#loginSubmit').click();
  }
  await login({ ...original, password: 'incorrect-password' });
  await page.waitForFunction(() => !document.querySelector('#loginError').hidden);
  assert.equal(await page.locator('#adminMain').isHidden(), true);
  await login(original);
  await page.waitForFunction(() => !document.querySelector('#adminMain').hidden);
  assert.equal(await page.locator('#currentUsername').textContent(), original.username);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#adminMain').hidden);
  const other = await browser.newContext();
  await authenticateContext(other, base, original);
  await page.locator('#openCredentials').click();
  await page.locator('#newUsername').fill(changed.username);
  await page.locator('#currentPassword').fill('incorrect-password');
  await page.locator('#newPassword').fill(changed.password);
  await page.locator('#confirmPassword').fill(changed.password);
  await page.locator('#saveCredentials').click();
  await page.waitForFunction(() => document.querySelector('#credentialsError').textContent.includes('password attuale'));
  await page.locator('#currentPassword').fill(original.password);
  await page.locator('#confirmPassword').fill('different');
  await page.locator('#saveCredentials').click();
  assert.match(await page.locator('#credentialsError').textContent(), /non coincidono/);
  await page.locator('#confirmPassword').fill(changed.password);
  await page.locator('#saveCredentials').click();
  await page.waitForFunction((username) => document.querySelector('#currentUsername').textContent === username, changed.username);
  accountChanged = true;
  assert.equal((await other.request.get(`${base}/api/appointments`)).status(), 401);
  await other.close();
  await page.locator('#logout').click();
  await page.waitForFunction(() => !document.querySelector('#loginMain').hidden && !document.querySelector('#loginSubmit').disabled);
  assert.equal(await page.locator('#visits tr').count(), 0);
  assert.equal(await page.locator('#accountActions').isHidden(), true);
  assert.equal((await context.request.get(`${base}/api/appointments`)).status(), 401);
  await login(original);
  await page.waitForFunction(() => !document.querySelector('#loginError').hidden);
  assert.equal(await page.locator('#adminMain').isHidden(), true);
  await login(changed);
  await page.waitForFunction(() => !document.querySelector('#adminMain').hidden);
  await page.locator('#openCredentials').click();
  await page.locator('#newUsername').fill(original.username);
  await page.locator('#currentPassword').fill(changed.password);
  await page.locator('#newPassword').fill(original.password);
  await page.locator('#confirmPassword').fill(original.password);
  await page.locator('#saveCredentials').click();
  await page.waitForFunction((username) => document.querySelector('#currentUsername').textContent === username, original.username);
  accountChanged = false;
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Login UI OK: pulsante desktop/mobile, accesso, persistenza sessione, cambio credenziali, revoca altre sessioni e logout.');
} finally {
  if (accountChanged) {
    const recovery = await browser.newContext();
    await authenticateContext(recovery, base, changed);
    const response = await recovery.request.put(`${base}/api/admin/credentials`, { data: {
      username: original.username, currentPassword: changed.password, newPassword: original.password, confirmPassword: original.password,
    } });
    assert.equal(response.status(), 200, 'Ripristino delle credenziali del database di test');
    await recovery.close();
  }
  await browser.close();
}
