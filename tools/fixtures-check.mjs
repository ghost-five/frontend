// Прогоняет золотые тесты против текущего движка.
// Запуск: node tools/fixtures-check.mjs
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { E } = require('../engine.js');
const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'fixtures', 'cases');

const clone = (x) => JSON.parse(JSON.stringify(x));

// Первое расхождение с путём до него: по нему сразу видно, что разъехалось.
function diff(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) return path + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
  if (typeof a !== 'object') return path + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = diff(a[k], b[k], path ? path + '.' + k : k);
    if (d) return d;
  }
  return null;
}

function apply(st, cfg, play) {
  if (play.mode === 'round') E.resolveRound(st, cfg, clone(play.moves['1']), clone(play.moves['2']));
  else if (play.mode === 'seq') E.resolveSeq(st, cfg, play.seat, clone(play.move));
  else if (play.mode === 'resign') E.resign(st, cfg, play.seat);
  else throw new Error('неизвестный режим: ' + play.mode);
}

let ok = 0;
const bad = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const c = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const st = clone(c.before);
  apply(st, c.cfg, c.play);
  const d = diff(c.after, st);
  if (d) bad.push([f, c.name, d]); else ok++;
}

console.log('совпало:', ok, 'из', ok + bad.length);
for (const [f, name, d] of bad) console.log('  ✗', f, '—', name, '\n     ', d);
process.exit(bad.length ? 1 : 0);
