import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

let child, base, fixture;
before(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'klinik-server-'));
  await mkdir(join(fixture, 'wwwroot'));
  await writeFile(join(fixture, 'wwwroot', 'index.html'), '<title>Clinica Aurora</title>');
  await writeFile(join(fixture, 'wwwroot', 'script.js'), 'console.log("Aurora");');
  await writeFile(join(fixture, 'secret.txt'), 'private');
  await symlink(join(fixture, 'secret.txt'), join(fixture, 'wwwroot', 'leak.txt'));
  child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    cwd: fixture, env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    child.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.once('error', reject);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => {
  if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

function get(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { headers, method }, (res) => {
      const chunks = [];
      res.on('data', (data) => chunks.push(data));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}

test('serves HTML and security headers', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.match(res.body.toString(), /Clinica Aurora/);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
test('negotiates gzip and respects explicit q=0', async () => {
  const zipped = await get('/', { 'Accept-Encoding': 'gzip' });
  assert.equal(zipped.headers['content-encoding'], 'gzip');
  assert.match(gunzipSync(zipped.body).toString(), /Clinica Aurora/);
  const plain = await get('/', { 'Accept-Encoding': 'gzip;q=0, *;q=1' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.match(plain.body.toString(), /Clinica Aurora/);
});
test('ETag revalidation returns 304 without a body', async () => {
  const first = await get('/');
  const cached = await get('/', { 'If-None-Match': first.headers.etag });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
});
test('HTML is always revalidated while versioned JS is immutable', async () => {
  assert.equal((await get('/?v=1')).headers['cache-control'], 'no-cache');
  assert.match((await get('/script.js?v=1')).headers['cache-control'], /immutable/);
});
test('HEAD has GET headers and no body; POST is rejected', async () => {
  const res = await get('/', {}, 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);
  assert.ok(Number(res.headers['content-length']) > 0);
  assert.equal((await get('/', {}, 'POST')).status, 405);
});
test('rejects traversal, external symlinks, invalid URLs and missing files', async () => {
  for (const [path, status] of [['/%2e%2e%2fsecret.txt', 403], ['/leak.txt', 403], ['/%ZZ', 400], ['/missing', 404]]) {
    assert.equal((await get(path)).status, status, path);
  }
  assert.equal((await get('/')).status, 200);
});
test('serves concurrent requests without blocking filesystem calls', async () => {
  const responses = await Promise.all(Array.from({ length: 40 }, () => get('/script.js')));
  assert.ok(responses.every((res) => res.status === 200 && res.body.length > 0));
});
