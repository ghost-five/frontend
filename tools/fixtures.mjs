// Золотые тесты движка: собирает позиции, прогоняет ход и записывает результат.
// Запуск:  node tools/fixtures.mjs        — пересобрать fixtures/cases/*.json
// Проверка: node tools/fixtures-check.mjs — прогнать их против текущего движка.
import { createRequire } from 'node:module';
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { E } = require('../engine.js');
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'fixtures', 'cases');

// Небольшие поля выбраны нарочно: фикстуру должно быть видно глазами.
const base = (over = {}) => Object.assign({
  size: 7, win: 4, secret: true, wallTtl: 0, mem: 0,
  anchor: false, shots: 0, capture: false, timer: 0, bank: 0
}, over);

const clone = (x) => JSON.parse(JSON.stringify(x));

// Позиция собирается вручную: так в фикстуре видно ровно то, что проверяем.
function setup(cfg, build) {
  const st = E.make(cfg, 1, 1);
  const n = cfg.size;
  const at = (r, c) => r * n + c;
  const api = {
    st, n, at,
    put(r, c, p) { st.cells[at(r, c)] = p; st.q[p].push(at(r, c)); return at(r, c); },
    anchor(r, c, p, setAt = 0) {
      const i = at(r, c);
      st.cells[i] = p; st.anchors.push(i); st.anchorSet[i] = setAt; st.anchorLeft[p]--;
      return i;
    },
    wall(r, c, ttl = 0) { const i = at(r, c); st.cells[i] = 3; st.walls.push([i, ttl]); return i; },
    round(k) { st.round = k; }
  };
  build(api);
  return st;
}

const cases = [];
function add(name, why, cfg, build, play) {
  const st = setup(cfg, build);
  const before = clone(st);
  const move = play(st, cfg);
  cases.push({
    name, why,
    cfg,
    before,
    play: move,
    after: clone(st)
  });
}

// ---------- Ход и короткая память ----------
add('обычный ход', 'оба ставят фишки: они появляются на поле, ход закрывается',
  base(), () => {},
  (st, cfg) => {
    const m1 = { i: 10, kind: 'place' }, m2 = { i: 30, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('оба в одну клетку', 'клетка выгорает и становится стеной, фишек там нет',
  base({ wallTtl: 3 }), () => {},
  (st, cfg) => {
    const m = { i: 24, kind: 'place' };
    E.resolveRound(st, cfg, clone(m), clone(m));
    return { mode: 'round', moves: { 1: clone(m), 2: clone(m) } };
  });

add('короткая память', 'лишняя фишка вытесняет самую старую — ту, что в очереди первая',
  base({ mem: 3 }), (b) => { b.put(1, 1, 1); b.put(1, 3, 1); b.put(1, 5, 1); },
  (st, cfg) => {
    const m1 = { i: 5 * 7 + 1, kind: 'place' }, m2 = { i: 5 * 7 + 5, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Победа ----------
add('четыре в ряд', 'ряд из четырёх заканчивает раунд победой первого',
  base(), (b) => { b.put(3, 0, 1); b.put(3, 1, 1); b.put(3, 2, 1); },
  (st, cfg) => {
    const m1 = { i: 24, kind: 'place' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('ряд у обоих', 'если оба собрали ряд одним ходом, раунд ничейный',
  base(), (b) => {
    b.put(1, 0, 1); b.put(1, 1, 1); b.put(1, 2, 1);
    b.put(5, 0, 2); b.put(5, 1, 2); b.put(5, 2, 2);
  },
  (st, cfg) => {
    const m1 = { i: 10, kind: 'place' }, m2 = { i: 38, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('пять в ряд', 'при правиле «пять» четвёрки не хватает',
  base({ win: 5, size: 9 }), (b) => { b.put(4, 0, 1); b.put(4, 1, 1); b.put(4, 2, 1); b.put(4, 3, 1); },
  (st, cfg) => {
    const m1 = { i: 4 * 9 + 4, kind: 'place' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Выстрелы ----------
add('выстрел в фишку', 'фишка соперника исчезает, на клетке остаётся след',
  base({ shots: 2 }), (b) => { b.put(2, 2, 2); },
  (st, cfg) => {
    const m1 = { i: 16, kind: 'shot' }, m2 = { i: 40, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('выстрел в якорь', 'якорь выстрелом не сбить, выстрел тратится',
  base({ shots: 1, anchor: true, mem: 4 }), (b) => { b.anchor(2, 2, 2); },
  (st, cfg) => {
    const m1 = { i: 16, kind: 'shot' }, m2 = { i: 40, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('выстрел угадал ход', 'выстрел в клетку, куда соперник только что пошёл',
  base({ shots: 1 }), () => {},
  (st, cfg) => {
    const m1 = { i: 24, kind: 'shot' }, m2 = { i: 24, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Захват пар ----------
add('захват пары', 'две зажатые фишки соперника исчезают',
  base({ capture: true }), (b) => { b.put(3, 1, 1); b.put(3, 2, 2); b.put(3, 3, 2); },
  (st, cfg) => {
    const m1 = { i: 3 * 7 + 4, kind: 'place' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Якорь ----------
add('якорь из фишки', 'своя фишка на поле становится якорем',
  base({ anchor: true, mem: 4 }), (b) => { b.put(2, 2, 1); },
  (st, cfg) => {
    const m1 = { i: 16, kind: 'anchor' }, m2 = { i: 40, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('щит якоря', 'фишка вплотную к якорю не стареет: вытесняется соседняя, а не она',
  base({ anchor: true, mem: 2 }),
  (b) => { b.anchor(3, 3, 1); b.put(3, 4, 1); b.put(0, 0, 1); b.put(0, 2, 1); },
  (st, cfg) => {
    const m1 = { i: 6 * 7 + 6, kind: 'place' }, m2 = { i: 3, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('возврат якоря', 'якорь уходит в запас, а фишка остаётся обычной',
  base({ anchor: true, mem: 4 }), (b) => { b.anchor(3, 3, 1, 0); b.round(E.ANCHOR_HOLD + 1); },
  (st, cfg) => {
    const m1 = { i: 0, kind: 'place', take: 3 * 7 + 3 }, m2 = { i: 6, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('сдвиг якоря', 'якорь переезжает, на прежней клетке остаётся след-стена',
  base({ anchor: true, mem: 4 }), (b) => { b.anchor(3, 3, 1); },
  (st, cfg) => {
    const m1 = { i: 3 * 7 + 4, kind: 'moveAnchor' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('сдвиг якоря в стену', 'якорь ломает стену, на которую наезжает',
  base({ anchor: true, mem: 4, wallTtl: 5 }), (b) => { b.anchor(3, 3, 1); b.wall(3, 4, 5); },
  (st, cfg) => {
    const m1 = { i: 3 * 7 + 4, kind: 'moveAnchor' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Магнит ----------
add('магнит тянет', 'фишки на луче съезжаются к якорю вплотную',
  base({ anchor: true, mem: 6, size: 9 }), (b) => { b.anchor(4, 1, 1); b.put(4, 3, 2); b.put(4, 4, 1); },
  (st, cfg) => {
    const m1 = { i: 4 * 9 + 3, kind: 'magnet' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('стена глушит магнит', 'стена на луче отменяет тягу целиком',
  base({ anchor: true, mem: 6, size: 9, wallTtl: 5 }),
  (b) => { b.anchor(4, 1, 1); b.wall(4, 2, 5); b.put(4, 3, 2); },
  (st, cfg) => {
    const m1 = { i: 4 * 9 + 3, kind: 'magnet' }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('магнит от выбранного якоря', 'игрок назвал якорь, тянет именно он',
  base({ anchor: true, mem: 6, size: 9 }),
  (b) => { b.anchor(4, 1, 1); b.anchor(4, 7, 1); b.put(4, 4, 2); },
  (st, cfg) => {
    const m1 = { i: 4 * 9 + 4, kind: 'magnet', from: 4 * 9 + 7 }, m2 = { i: 0, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('магниты сцепились', 'оба якоря тянут одну фишку: не едет никто, обоим кулдаун',
  base({ anchor: true, mem: 6, size: 9 }),
  (b) => { b.anchor(4, 2, 1); b.anchor(4, 6, 2); b.put(4, 4, 1); },
  (st, cfg) => {
    const m1 = { i: 4 * 9 + 4, kind: 'magnet' }, m2 = { i: 4 * 9 + 4, kind: 'magnet' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Стены, пропуски, сдача ----------
add('стена разрушается', 'срок вышел — стена исчезает',
  base({ wallTtl: 1 }), (b) => { b.wall(2, 2, 1); },
  (st, cfg) => {
    const m1 = { i: 0, kind: 'place' }, m2 = { i: 48, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('третий пропуск подряд', 'три пропуска подряд — поражение',
  base(), (b) => { b.st.misses = { 1: 2, 2: 0 }; },
  (st, cfg) => {
    const m1 = { kind: 'pass' }, m2 = { i: 10, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('сдача', 'победа достаётся сопернику',
  base(), (b) => { b.put(1, 1, 1); },
  (st, cfg) => {
    E.resign(st, cfg, 2);
    return { mode: 'resign', seat: 2 };
  });

// ---------- Время ----------
add('запас времени', 'перерасход списывается из запаса игрока',
  base({ timer: 15, bank: 60 }), () => {},
  (st, cfg) => {
    const m1 = { i: 10, kind: 'place', spent: 7 }, m2 = { i: 30, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

add('запас возвращается', 'три чистых хода подряд — и запас снова полон',
  base({ timer: 15, bank: 60 }), (b) => { b.st.bank = { 1: 40, 2: 60 }; b.st.clean = { 1: 2, 2: 0 }; },
  (st, cfg) => {
    const m1 = { i: 10, kind: 'place' }, m2 = { i: 30, kind: 'place' };
    E.resolveRound(st, cfg, m1, m2);
    return { mode: 'round', moves: { 1: m1, 2: m2 } };
  });

// ---------- Ходы по очереди (без тайного хода) ----------
add('ход по очереди', 'без тайного хода игроки ходят поочерёдно',
  base({ secret: false }), () => {},
  (st, cfg) => {
    const m = { i: 24, kind: 'place' };
    E.resolveSeq(st, cfg, 1, m);
    return { mode: 'seq', seat: 1, move: m };
  });

// ---------- Запись ----------
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) unlinkSync(join(OUT, f));
cases.forEach((c, k) => {
  const slug = String(k + 1).padStart(3, '0') + '-' + c.name.replace(/[^а-яёa-z0-9]+/gi, '-').toLowerCase();
  writeFileSync(join(OUT, slug + '.json'), JSON.stringify(c, null, 2) + '\n', 'utf8');
});
console.log('записано фикстур:', cases.length);
