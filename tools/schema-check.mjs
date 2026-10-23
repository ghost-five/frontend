// Сверяет состояния из золотых тестов со схемой docs/api/game-state.schema.json.
// Проверяется то подмножество JSON Schema, которым схема пользуется:
// type, required, properties, additionalProperties, items, enum, minimum, $ref, allOf.
// Запуск: node tools/schema-check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const schema = JSON.parse(readFileSync(join(root, 'docs/api/game-state.schema.json'), 'utf8'));

const deref = (s) => {
  if (!s || !s.$ref) return s;
  const path = s.$ref.replace(/^#\//, '').split('/');
  let cur = schema;
  for (const p of path) cur = cur[p];
  return deref(cur);
};

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);

function check(value, node, path, errs) {
  const s = deref(node);
  if (!s) return;
  if (s.allOf) { for (const part of s.allOf) check(value, part, path, errs); return; }
  if (s.type) {
    const want = Array.isArray(s.type) ? s.type : [s.type];
    const got = typeOf(value);
    const ok = want.includes(got) || (want.includes('number') && got === 'integer');
    if (!ok) { errs.push(path + ': ожидался ' + want.join('|') + ', пришёл ' + got); return; }
  }
  if (s.enum && !s.enum.includes(value)) errs.push(path + ': ' + JSON.stringify(value) + ' нет в enum');
  if (typeof value === 'number' && s.minimum !== undefined && value < s.minimum) errs.push(path + ': меньше ' + s.minimum);
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) errs.push(path + ': элементов меньше ' + s.minItems);
    if (s.maxItems !== undefined && value.length > s.maxItems) errs.push(path + ': элементов больше ' + s.maxItems);
    if (s.items) value.forEach((v, k) => check(v, s.items, path + '[' + k + ']', errs));
    return;
  }
  if (value && typeof value === 'object') {
    for (const r of s.required || []) if (!(r in value)) errs.push(path + ': нет обязательного поля ' + r);
    for (const [k, v] of Object.entries(value)) {
      const sub = (s.properties && s.properties[k]) || (s.additionalProperties && typeof s.additionalProperties === 'object' ? s.additionalProperties : null);
      if (sub) check(v, sub, path ? path + '.' + k : k, errs);
      else if (s.additionalProperties === false && s.properties) errs.push(path + ': лишнее поле ' + k);
    }
  }
}

const dir = join(root, 'fixtures', 'cases');
let ok = 0;
const bad = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const errs = [];
  check(c.before, schema, 'before', errs);
  check(c.after, schema, 'after', errs);
  if (errs.length) bad.push([f, errs]); else ok++;
}
console.log('состояний по схеме:', ok * 2, 'из', (ok + bad.length) * 2);
for (const [f, errs] of bad) console.log('  ✗', f, '\n     ', errs.slice(0, 5).join('\n      '));
process.exit(bad.length ? 1 : 0);
