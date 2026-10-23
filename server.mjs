import { open, realpath } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { createGzip } from 'node:zlib';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
// Il server alternativo pubblica la stessa cartella usata da ASP.NET Core.
const root = await realpath(resolve(process.cwd(), 'wwwroot'));

// Associa ogni estensione usata dal sito al Content-Type inviato al browser.
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  let requestUrl;

  // Converte l'URL in un percorso locale. Un escape percentuale malformato
  // genera una risposta controllata, senza arrestare l'intero processo Node.
  try {
    requestUrl = new URL(request.url ?? '/', 'http://localhost');
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Richiesta non valida');
    return;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolve(root, requestedPath);
  const pathFromRoot = relative(root, filePath);

  // `relative` rende il controllo valido sia con separatori Unix (`/`) sia
  // Windows (`\\`), senza impedire l'accesso ai normali file del progetto.
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    response.writeHead(403).end('Accesso negato');
    return;
  }

  let file;
  try {
    const actualPath = await realpath(filePath);
    const actualRelative = relative(root, actualPath);
    if (actualRelative.startsWith('..') || isAbsolute(actualRelative)) {
      response.writeHead(403).end('Accesso negato');
      return;
    }
    file = await open(actualPath);
    const stat = await file.stat();
    if (!stat.isFile()) {
      response.writeHead(404).end('Pagina non trovata');
      return;
    }
    const extension = extname(filePath);
    const encodings = new Map((request.headers['accept-encoding'] ?? '').split(',').map((entry) => {
      const [name, ...parameters] = entry.trim().toLowerCase().split(';');
      const quality = parameters.find((value) => value.trim().startsWith('q='));
      return [name, quality ? Number(quality.trim().slice(2)) : 1];
    }));
    const shouldCompress = (encodings.get('gzip') ?? encodings.get('*') ?? 0) > 0
      && compressibleExtensions.has(extension);
    const isVersionedAsset = requestUrl.searchParams.has('v') && extension !== '.html';
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = {
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': isVersionedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Vary': 'Accept-Encoding',
      'ETag': etag,
      'Last-Modified': stat.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    };
    if (shouldCompress) headers['Content-Encoding'] = 'gzip';
    const tags = (request.headers['if-none-match'] ?? '').split(',').map((tag) => tag.trim());
    if (tags.some((tag) => tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
      response.writeHead(304, headers).end();
      return;
    }
    if (!shouldCompress) headers['Content-Length'] = stat.size;
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = file.createReadStream();
    file = null; // Il flusso possiede e chiude il descrittore, anche in caso di errore.
    if (shouldCompress) pipeline(stream, createGzip(), response, () => {});
    else pipeline(stream, response, () => {});
  } catch (error) {
    if (response.headersSent) response.destroy();
    else response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
      { 'Content-Type': 'text/plain; charset=utf-8' }).end('Risorsa non disponibile');
  } finally {
    if (file) await file.close();
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${server.address().port}`;
  console.log(`Clinica Aurora disponibile su ${url}`);

  if (process.argv.includes('--open')) {
    // Sceglie il comando del sistema operativo per aprire il browser standard.
    const commands = {
      darwin: ['open', [url]],
      win32: ['cmd', ['/c', 'start', '', url]],
      linux: ['xdg-open', [url]],
    };
    const [command, args] = commands[process.platform] ?? [];
    if (command) spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  }
});

function stop() {
  server.close(() => process.exit(0));
}

// Chiude correttamente il socket quando si preme Ctrl+C o il processo termina.
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
