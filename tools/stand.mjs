// Поднимает тестовый стенд: копия игры с подменённым клиентом Supabase.
// Запуск: node tools/stand.mjs  (остановить — Ctrl+C)
import { createServer } from 'node:http';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const stand = join(here, '.stand');
const PORT = Number(process.env.PORT || 8778);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

export async function build() {
  await mkdir(join(stand, 'vendor'), { recursive: true });
  for (const f of ['index.html', 'app.js', 'engine.js', 'styles.css']) await copyFile(join(root, f), join(stand, f));
  await copyFile(join(here, 'mock-supabase.js'), join(stand, 'vendor', 'supabase.js'));
  await writeFile(join(stand, 'config.js'), "window.GHOST_CONFIG = { supabaseUrl: 'https://stand.local', supabaseKey: 'sb_publishable_stand' };\n");
}

export async function serve() {
  await build();
  // Многопоточного сервера в Node не нужно, но держим соединения живыми: Chrome открывает их помногу.
  const srv = createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    const file = join(stand, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end('not found');
    }
  });
  srv.keepAliveTimeout = 60000;
  await new Promise((ok) => srv.listen(PORT, '127.0.0.1', ok));
  return srv;
}

if (process.argv[1] && process.argv[1].endsWith('stand.mjs')) {
  await serve();
  console.log('Стенд: http://localhost:' + PORT + '/?as=1  (второй игрок: ?as=2)');
}
