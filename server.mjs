import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { createGzip } from 'node:zlib';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
// Il server alternativo pubblica la stessa cartella usata da ASP.NET Core.
const root = resolve(process.cwd(), 'wwwroot');

// Associa ogni estensione usata dal sito al Content-Type inviato al browser.
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);

const server = createServer((request, response) => {
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

  // Se il file è presente lo invia come stream: in questo modo non viene
  // caricato interamente in memoria. Le risorse mancanti restituiscono 404.
  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a file');
    const extension = extname(filePath);
    const acceptsGzip = request.headers['accept-encoding']?.includes('gzip');
    const shouldCompress = acceptsGzip && compressibleExtensions.has(extension);
    const isVersionedAsset = requestUrl.searchParams.has('v');

    response.writeHead(200, {
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': isVersionedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Encoding': shouldCompress ? 'gzip' : 'identity',
      'Vary': 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    if (shouldCompress) stream.pipe(createGzip()).pipe(response);
    else stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pagina non trovata');
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
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
