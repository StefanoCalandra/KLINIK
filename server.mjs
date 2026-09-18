import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
const root = resolve(process.cwd(), 'wwwroot');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
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

  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pagina non trovata');
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`Clinica Aurora disponibile su ${url}`);

  if (process.argv.includes('--open')) {
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

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
