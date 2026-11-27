import assert from 'node:assert/strict';

export async function authenticateContext(context, base, credentials = {}) {
  let session = await (await context.request.get(`${base}/api/admin/session`)).json();
  const response = await context.request.post(`${base}/api/admin/login`, {
    headers: { 'X-CSRF-TOKEN': session.csrfToken },
    data: { username: credentials.username ?? process.env.KLINIK_ADMIN_USERNAME ?? 'admin', password: credentials.password ?? process.env.KLINIK_ADMIN_PASSWORD ?? 'admin' },
  });
  assert.equal(response.status(), 200, 'Accesso admin del database di test');
  session = await (await context.request.get(`${base}/api/admin/session`)).json();
  assert.equal(session.authenticated, true);
  await context.setExtraHTTPHeaders({ 'X-CSRF-TOKEN': session.csrfToken });
  return session;
}
