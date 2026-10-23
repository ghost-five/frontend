// «Призрачная пятёрка»: правила игры и бот.
// Чистые функции над простым JSON-состоянием, одинаковые у обоих игроков.
(function (root) {
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  // Восемь лучей магнита: по горизонтали, вертикали и обеим диагоналям в обе стороны.
  const RAYS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const WIN = 1000000;
  // Веса для «сколько своих фишек в окне»: отдельные для ряда из пяти и из четырёх.
  const W5 = [0, 2, 30, 500, 9000, WIN];
  const W4 = [0, 3, 60, 2000, WIN];
  const weights = (win) => (win === 4 ? W4 : W5);
  const rowLen = (cfg) => (cfg.win === 4 ? 4 : 5);
  // Сколько ходов якорь стоит, прежде чем его можно забрать обратно.
  const ANCHOR_HOLD = 5;
  // Якорей на игрока, дальность магнита и срок следа, который остаётся после сдвига.
  const ANCHORS = 2;
  const MAGNET_RANGE = 3;
  const ECHO_TTL = 1;
  // Сколько ходов подряд надо уложиться в основное время, чтобы запас вернулся.
  const BANK_STREAK = 3;
  // Сколько снимков поля храним для перемотки.
  const FRAMES = 80;
  // Сколько ходов подряд можно пропустить, прежде чем засчитают поражение.
  const MISS_LIMIT = 3;

  const E = {
    ANCHOR_HOLD,
    ANCHORS,
    MAGNET_RANGE,
    MISS_LIMIT,
    BANK_STREAK,
    FRAMES,
    rowLen,
    anchorOn: (cfg) => !!cfg.anchor && cfg.mem > 0,

    make(cfg, starter, gameNo) {
      const n = cfg.size;
      const st = {
        n, cells: new Array(n * n).fill(0), q: { 1: [], 2: [] }, anchors: [], anchorSet: {},
        anchorLeft: { 1: ANCHORS, 2: ANCHORS }, shots: { 1: cfg.shots, 2: cfg.shots }, caps: { 1: 0, 2: 0 },
        walls: [], scar: [], misses: { 1: 0, 2: 0 }, bank: { 1: cfg.bank || 0, 2: cfg.bank || 0 },
        clean: { 1: 0, 2: 0 }, frames: [],
        round: 1, moves: 0, turn: starter, starter, gameNo,
        over: false, winner: 0, winLine: [], winReason: '', last: [], log: [],
        fx: { fresh: [], gone: [], burn: -1 }
      };
      E.log(st, '', [{ k: 'start', secret: !!cfg.secret, starter }]);
      return st;
    },

    log(st, tag, ev, kind) {
      st.log.unshift({ tag, ev, kind: kind || '' });
      if (st.log.length > 16) st.log.pop();
    },

    resetFx(st) { st.fx = { fresh: [], gone: [], burn: -1, slide: [] }; },

    // Запас времени: сколько секунд игрок добрал сверх основного лимита.
    spend(st, p, sec) {
      if (!sec) return;
      if (!st.bank) st.bank = { 1: 0, 2: 0 };
      st.bank[p] = Math.max(0, (st.bank[p] || 0) - Math.max(0, Math.round(sec)));
    },
    // Три хода подряд без запаса — и он снова полон.
    bankTick(st, cfg, p, m, ev) {
      if (!cfg.bank) return;
      if (!st.clean) st.clean = { 1: 0, 2: 0 };
      const acted = m && m.kind && m.kind !== 'pass';
      if (m && m.spent) { st.clean[p] = 0; return; }
      if (!acted) { st.clean[p] = 0; return; }
      st.clean[p] = (st.clean[p] || 0) + 1;
      if (st.clean[p] < BANK_STREAK) return;
      st.clean[p] = 0;
      if ((st.bank[p] || 0) >= cfg.bank) return;
      st.bank[p] = cfg.bank;
      ev.push({ k: 'bankBack', p });
    },
    // Снимок поля для перемотки: строка из клеток и короткий заголовок.
    snap(st, tag) {
      if (!st.frames) st.frames = [];
      st.frames.push({ t: tag, c: st.cells.join(''), l: st.last.slice(0, 4), s: (st.scar || []).map((x) => x[0]) });
      if (st.frames.length > FRAMES) st.frames.shift();
    },
    // Три пропуска подряд — поражение; любой сделанный ход обнуляет счёт.
    countMiss(st, ev) {
      if (!st.misses) st.misses = { 1: 0, 2: 0 };
      for (const p of [1, 2]) {
        const passed = ev.some((e) => e.k === 'pass' && e.p === p);
        const acted = ev.some((e) => e.p === p && e.k !== 'pass' && e.k !== 'unanchor' && e.k !== 'vanish');
        if (passed) st.misses[p] = (st.misses[p] || 0) + 1;
        else if (acted) st.misses[p] = 0;
      }
    },
    missOut(st, cfg, tag) {
      if (st.over || !st.misses) return;
      const out1 = st.misses[1] >= MISS_LIMIT, out2 = st.misses[2] >= MISS_LIMIT;
      if (!out1 && !out2) return;
      if (out1 && out2) E.finish(st, 0, { line: [], reason: 'misses' }, tag);
      else E.finish(st, out1 ? 2 : 1, { line: [], reason: 'misses' }, tag);
    },

    // Общий счётчик ходов партии: в тайном режиме раунд, иначе номер полухода.
    clock: (st, cfg) => (cfg.secret ? st.round : st.moves),

    place(st, cfg, p, i, anchor) {
      st.cells[i] = p;
      if (anchor && E.anchorOn(cfg) && st.anchorLeft[p] > 0) {
        st.anchors.push(i);
        st.anchorLeft[p]--;
        if (!st.anchorSet) st.anchorSet = {};
        st.anchorSet[i] = E.clock(st, cfg);
      } else st.q[p].push(i);
    },

    anchorsOf: (st, p) => st.anchors.filter((i) => st.cells[i] === p),
    anchorOf(st, p) {
      const all = E.anchorsOf(st, p);
      return all.length ? all[0] : -1;
    },
    anchorAge(st, cfg, i) {
      const at = (st.anchorSet && st.anchorSet[i]) || 0;
      return E.clock(st, cfg) - at;
    },
    // Якорь можно забрать обратно, когда он простоял своё; он снова идёт в запас.
    canUnanchor(st, cfg, p, i) {
      if (!E.anchorOn(cfg) || st.over) return false;
      if (typeof i === 'number') {
        return st.cells[i] === p && st.anchors.includes(i) && E.anchorAge(st, cfg, i) >= ANCHOR_HOLD;
      }
      return E.ripeAnchor(st, cfg, p) >= 0;
    },
    // Самый долго стоящий якорь: его и забираем, если игрок не указал другой.
    ripeAnchor(st, cfg, p) {
      let best = -1, oldest = -1;
      for (const i of E.anchorsOf(st, p)) {
        const age = E.anchorAge(st, cfg, i);
        if (age >= ANCHOR_HOLD && age > oldest) { oldest = age; best = i; }
      }
      return best;
    },
    takeAnchor(st, cfg, p, which, ev) {
      const i = typeof which === 'number' && which >= 0 ? which : E.ripeAnchor(st, cfg, p);
      if (i < 0 || !E.canUnanchor(st, cfg, p, i)) return false;
      E.remove(st, i);
      st.anchorLeft[p]++;
      ev.push({ k: 'unanchor', p, i });
      return true;
    },
    // Щит: свои фишки вплотную к якорю не стареют и не занимают место в памяти.
    shielded(st, p, i) {
      if (!st.anchors.length) return false;
      const n = st.n, r = (i / n) | 0, c = i % n;
      for (const a of st.anchors) {
        if (st.cells[a] !== p) continue;
        const ar = (a / n) | 0, ac = a % n;
        if (Math.abs(ar - r) <= 1 && Math.abs(ac - c) <= 1) return true;
      }
      return false;
    },
    // Сколько фишек игрока считается в лимит памяти.
    counted: (st, p) => st.q[p].filter((i) => !E.shielded(st, p, i)),

    remove(st, i) {
      const p = st.cells[i];
      if (p !== 1 && p !== 2) return;
      st.cells[i] = 0;
      st.q[p] = st.q[p].filter((x) => x !== i);
      st.anchors = st.anchors.filter((x) => x !== i);
      if (st.anchorSet) delete st.anchorSet[i];
      st.fx.gone.push([i, p]);
    },
    // Фишка переезжает на другую клетку, сохраняя своё место в очереди памяти.
    shift(st, from, to) {
      const p = st.cells[from];
      if (p !== 1 && p !== 2) return;
      st.cells[from] = 0;
      st.cells[to] = p;
      const q = st.q[p], k = q.indexOf(from);
      if (k >= 0) q[k] = to;
      if (st.anchors.includes(from)) {
        st.anchors = st.anchors.filter((x) => x !== from).concat(to);
        if (st.anchorSet && st.anchorSet[from] !== undefined) {
          st.anchorSet[to] = st.anchorSet[from];
          delete st.anchorSet[from];
        }
      }
      st.fx.gone.push([from, p]);
      st.fx.fresh.push(to);
    },

    trim(st, cfg, p) {
      if (!cfg.mem) return -1;
      const free = E.counted(st, p);
      if (free.length <= cfg.mem) return -1;
      const i = free[0];
      E.remove(st, i);
      return i;
    },

    captures(cells, n, i, p) {
      const r = (i / n) | 0, c = i % n, opp = 3 - p, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r3 = r + 3 * dr, c3 = c + 3 * dc;
        if (r3 < 0 || r3 >= n || c3 < 0 || c3 >= n) continue;
        const a = (r + dr) * n + c + dc, b = (r + 2 * dr) * n + c + 2 * dc, d = r3 * n + c3;
        if (cells[a] === opp && cells[b] === opp && cells[d] === p) out.push(a, b);
      }
      return out;
    },

    doCaptures(st, cfg, placed, ev) {
      if (!cfg.capture) return;
      const rem = new Set(), counts = { 1: 0, 2: 0 };
      for (const [p, i] of placed) {
        if (st.cells[i] !== p) continue;
        const got = E.captures(st.cells, st.n, i, p);
        counts[p] += got.length / 2;
        got.forEach((x) => rem.add(x));
      }
      rem.forEach((x) => E.remove(st, x));
      for (const p of [1, 2]) if (counts[p]) {
        st.caps[p] += counts[p];
        ev.push({ k: 'cap', p, n: counts[p], total: st.caps[p] });
      }
    },

    // Стена со сроком 0 стоит вечно; остальные разрушаются, даже если правило выключено.
    wallTick(st, skip) {
      let broken = 0;
      const keep = [];
      for (const [i, t] of st.walls) {
        if (i === skip || !t) { keep.push([i, t]); continue; }
        if (t <= 1) { st.cells[i] = 0; broken++; } else keep.push([i, t - 1]);
      }
      st.walls = keep;
      return broken;
    },

    findWin(st, cfg, p) {
      const n = st.n, c = st.cells, need = rowLen(cfg);
      for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
        if (c[r * n + col] !== p) continue;
        for (const [dr, dc] of DIRS) {
          const pr = r - dr, pc = col - dc;
          if (pr >= 0 && pr < n && pc >= 0 && pc < n && c[pr * n + pc] === p) continue;
          const line = [];
          let rr = r, cc = col;
          while (rr >= 0 && rr < n && cc >= 0 && cc < n && c[rr * n + cc] === p) { line.push(rr * n + cc); rr += dr; cc += dc; }
          if (line.length >= need) return line;
        }
      }
      return null;
    },

    checkWin(st, cfg, p) {
      const line = E.findWin(st, cfg, p);
      if (line) return { line, reason: 'five' };
      if (cfg.capture && st.caps[p] >= 5) return { line: [], reason: 'caps' };
      return null;
    },

    finish(st, w, info, tag) {
      st.over = true; st.winner = w; st.winLine = info.line; st.winReason = info.reason;
      E.log(st, tag, [{ k: 'result', w, reason: info.reason }], 'win');
    },

    validTarget(st, cfg, p, i, kind) {
      if (typeof i !== 'number' || i < 0 || i >= st.cells.length) return false;
      const v = st.cells[i];
      if (kind === 'place') return v === 0;
      if (kind === 'anchor') return E.canAnchor(st, cfg, p) && (v === 0 || (v === p && !st.anchors.includes(i)));
      // Якорь выстрелом не берётся, целиться в него незачем.
      if (kind === 'shot') return (v === 3 - p && !st.anchors.includes(i)) || (!!cfg.secret && v === 0);
      if (kind === 'unanchor') return v === p && st.anchors.includes(i) && E.canUnanchor(st, cfg, p, i);
      if (kind === 'moveAnchor') return E.canMoveAnchor(st, cfg, p, i);
      if (kind === 'magnet') return !!E.magnetPlan(st, cfg, p, i);
      return false;
    },

    canShoot(st, cfg, p) {
      if (!(cfg.shots > 0 && st.shots[p] > 0)) return false;
      if (cfg.secret) return true;
      return st.cells.some((v, i) => v === 3 - p && !st.anchors.includes(i));
    },

    // Сдвинуть можно любой свой якорь, стоящий рядом с выбранной клеткой.
    anchorNear(st, p, to) {
      const n = st.n, r = (to / n) | 0, c = to % n;
      let best = -1, oldest = -1;
      for (const a of E.anchorsOf(st, p)) {
        const ar = (a / n) | 0, ac = a % n;
        if (Math.abs(ar - r) > 1 || Math.abs(ac - c) > 1 || a === to) continue;
        const age = (st.anchorSet && st.anchorSet[a]) || 0;
        if (best < 0 || age < oldest) { best = a; oldest = age; }
      }
      return best;
    },
    // Якорь ломает стену только в движении, а на покинутой клетке оставляет след.
    moveAnchor(st, cfg, p, to, ev, pick) {
      const from = typeof pick === 'number' && pick >= 0 ? pick : E.anchorNear(st, p, to);
      if (from < 0 || !E.canMoveAnchor(st, cfg, p, to, from)) return false;
      const wall = st.cells[to] === 3;
      if (wall) st.walls = st.walls.filter(([wi]) => wi !== to);
      E.shift(st, from, to);
      st.fx.slide = (st.fx.slide || []).concat([[from, to]]);
      st.cells[from] = 3;
      st.walls.push([from, ECHO_TTL]);
      ev.push({ k: 'anchorMove', p, from, i: to, wall });
      return from;
    },
    // Якорем можно сделать и фишку, которая уже стоит на поле.
    setAnchor(st, cfg, p, i, ev) {
      if (!E.anchorOn(cfg) || st.anchorLeft[p] <= 0) return false;
      if (st.cells[i] !== p || st.anchors.includes(i)) return false;
      st.q[p] = st.q[p].filter((x) => x !== i);
      st.anchors.push(i);
      st.anchorLeft[p]--;
      if (!st.anchorSet) st.anchorSet = {};
      st.anchorSet[i] = E.clock(st, cfg);
      st.fx.fresh.push(i);
      ev.push({ k: 'anchorSet', p, i });
      return true;
    },
    canAnchor: (st, cfg, p) => E.anchorOn(cfg) && st.anchorLeft[p] > 0,

    canMoveAnchor(st, cfg, p, to, pick) {
      if (!E.anchorOn(cfg)) return false;
      const from = typeof pick === 'number' && pick >= 0 ? pick : E.anchorNear(st, p, to);
      if (from < 0) return false;
      const n = st.n, r = (from / n) | 0, c = from % n, rr = (to / n) | 0, cc = to % n;
      if (Math.abs(r - rr) > 1 || Math.abs(c - cc) > 1 || from === to) return false;
      return st.cells[to] === 0 || st.cells[to] === 3;
    },

    // ---------- Магнит ----------
    // Якорь тянет к себе фишки по одному лучу: до двух своих и двух чужих, всего четыре.
    magnetPlan(st, cfg, p, to) {
      if (!E.anchorOn(cfg)) return null;
      const n = st.n;
      for (const from of E.anchorsOf(st, p)) {
        const r0 = (from / n) | 0, c0 = from % n;
        for (const [dr, dc] of RAYS) {
          const line = [];
          for (let k = 1; k <= MAGNET_RANGE; k++) {
            const r = r0 + dr * k, c = c0 + dc * k;
            if (r < 0 || r >= n || c < 0 || c >= n) break;
            line.push(r * n + c);
          }
          if (!line.includes(to)) continue;
          // Стена на луче глушит магнит целиком.
          if (line.some((i) => st.cells[i] === 3)) return null;
          if (!line.some((i) => st.cells[i] === 1 || st.cells[i] === 2)) return null;
          return { from, line };
        }
      }
      return null;
    },
    // Есть ли вообще кого притягивать: нужен хотя бы один луч с фишкой и без стены.
    canMagnet(st, cfg, p) {
      if (!E.anchorOn(cfg)) return false;
      const n = st.n;
      for (const from of E.anchorsOf(st, p)) {
        const r0 = (from / n) | 0, c0 = from % n;
        for (const [dr, dc] of RAYS) {
          let wall = false, stone = false;
          for (let k = 1; k <= MAGNET_RANGE; k++) {
            const r = r0 + dr * k, c = c0 + dc * k;
            if (r < 0 || r >= n || c < 0 || c >= n) break;
            const v = st.cells[r * n + c];
            if (v === 3) { wall = true; break; }
            if (v === 1 || v === 2) stone = true;
          }
          if (!wall && stone) return true;
        }
      }
      return false;
    },
    doMagnet(st, cfg, p, to, ev) {
      const plan = E.magnetPlan(st, cfg, p, to);
      if (!plan) return false;
      const { from, line } = plan;
      let mine = 2, foe = 2, left = 4, slot = 0;
      const moves = [];
      for (const cell of line) {
        const v = st.cells[cell];
        if (v === 0) continue;
        // Чужой якорь не сдвинуть: на нём луч и заканчивается.
        if (st.anchors.includes(cell)) break;
        const own = v === p;
        if (left <= 0 || (own ? mine : foe) <= 0) break;
        const target = line[slot];
        if (target !== cell) { E.shift(st, cell, target); moves.push([cell, target]); }
        slot++; left--;
        if (own) mine--; else foe--;
      }
      st.fx.slide = (st.fx.slide || []).concat(moves);
      ev.push({ k: 'magnet', p, i: to, from, n: moves.length });
      return true;
    },

    // Тайный ход: оба хода открываются одновременно.
    resolveRound(st, cfg, m1, m2) {
      E.resetFx(st);
      st.scar = [];
      const tag = 'Р' + st.round, ev = [], placed = [];
      // Якорь забирают бесплатно и до самого хода: освободившаяся клетка сразу годится.
      for (const [p, m] of [[1, m1], [2, m2]]) E.spend(st, p, m.spent);
      for (const [p, m] of [[1, m1], [2, m2]]) if (m.take) E.takeAnchor(st, cfg, p, m.take, ev);
      // Ход «якорь» на пустую клетку — это тоже постановка фишки.
      const putting = (m) => (m.kind === 'place' || m.kind === 'anchor') && st.cells[m.i] === 0;
      // На какую клетку игрок метит: поставить фишку или привести туда якорь.
      const claim = (p, m) => (putting(m) ? m.i : m.kind === 'moveAnchor' && E.canMoveAnchor(st, cfg, p, m.i) ? m.i : -1);
      const c1 = claim(1, m1), c2 = claim(2, m2);
      let kind = '', newWall = -1;
      let echo = -1;
      if (c1 >= 0 && c1 === c2) {
        // Оба метили в одну клетку: она выгорает, и ни фишка, ни якорь туда не попадают.
        const hitAnchor = m1.kind === 'moveAnchor' || m2.kind === 'moveAnchor';
        st.cells[c1] = 3;
        st.walls.push([c1, cfg.wallTtl || 0]);
        newWall = c1; st.fx.burn = c1; st.last = [];
        ev.push({ k: 'burn', i: c1, anchor: hitAnchor }); kind = 'burn';
      } else {
        for (const [p, m] of [[1, m1], [2, m2]]) {
          if (m.kind === 'anchor' && st.cells[m.i] === p) { E.setAnchor(st, cfg, p, m.i, ev); continue; }
          if (!putting(m)) continue;
          const before = st.anchors.length;
          E.place(st, cfg, p, m.i, m.kind === 'anchor' || m.anchor);
          placed.push([p, m.i]);
          st.fx.fresh.push(m.i);
          ev.push({ k: st.anchors.length > before ? 'anchor' : 'place', p, i: m.i });
        }
        st.last = placed.map((x) => x[1]);
        for (const [p, m] of [[1, m1], [2, m2]]) {
          if (m.kind !== 'shot' || st.shots[p] <= 0) continue;
          st.shots[p]--;
          const target = st.cells[m.i];
          if (target === 3 - p && st.anchors.includes(m.i)) ev.push({ k: 'anchorMiss', p, i: m.i });
          else if (target === 3 - p) {
            const guessed = placed.some(([pp, ii]) => pp === 3 - p && ii === m.i);
            E.remove(st, m.i);
            st.scar.push([m.i, 3 - p]);
            st.last = st.last.filter((x) => x !== m.i);
            ev.push({ k: 'hit', p, i: m.i, guessed });
          } else ev.push({ k: 'miss', p, i: m.i });
        }
        for (const [p, m] of [[1, m1], [2, m2]]) {
          if (m.kind === 'unanchor') E.takeAnchor(st, cfg, p, m.i, ev);
          else if (m.kind === 'moveAnchor') { const was = E.moveAnchor(st, cfg, p, m.i, ev, m.from); if (was !== false) echo = was; }
          else if (m.kind === 'magnet') E.doMagnet(st, cfg, p, m.i, ev);
        }
        // Снятие якоря ходом не считается, поэтому в «не успел сходить» оно не входит.
        const acted = new Set(ev.filter((e) => e.k !== 'unanchor').map((e) => e.p));
        for (const [p, m] of [[1, m1], [2, m2]]) {
          if (!acted.has(p) && m.kind !== 'unanchor') ev.push({ k: 'pass', p });
        }
        if (!ev.length) ev.push({ k: 'open' });
      }
      E.doCaptures(st, cfg, placed, ev);
      for (const p of [1, 2]) {
        const gone = E.trim(st, cfg, p);
        if (gone >= 0) ev.push({ k: 'vanish', p, i: gone });
      }
      const broken = E.wallTick(st, newWall >= 0 ? newWall : echo);
      if (broken) ev.push({ k: 'wallGone', n: broken });
      E.countMiss(st, ev);
      for (const [p, m] of [[1, m1], [2, m2]]) E.bankTick(st, cfg, p, m, ev);
      E.log(st, tag, ev, kind);
      E.snap(st, tag);
      const w1 = E.checkWin(st, cfg, 1), w2 = E.checkWin(st, cfg, 2);
      if (w1 && w2) E.finish(st, 0, { line: w1.line.concat(w2.line), reason: 'both' }, tag);
      else if (w1) E.finish(st, 1, w1, tag);
      else if (w2) E.finish(st, 2, w2, tag);
      else if (!st.cells.includes(0)) E.finish(st, 0, { line: [], reason: 'full' }, tag);
      E.missOut(st, cfg, tag);
      if (!st.over) st.round++;
    },

    // Обычные ходы по очереди.
    resolveSeq(st, cfg, p, m) {
      E.resetFx(st);
      st.scar = [];
      st.moves++;
      const tag = 'Х' + st.moves, ev = [];
      E.spend(st, p, m.spent);
      if (m.take) E.takeAnchor(st, cfg, p, m.take, ev);
      if (m.kind === 'anchor' && st.cells[m.i] === p) {
        st.last = [m.i];
        E.setAnchor(st, cfg, p, m.i, ev);
      } else if (m.kind === 'place' || m.kind === 'anchor') {
        const before = st.anchors.length;
        E.place(st, cfg, p, m.i, m.kind === 'anchor' || m.anchor);
        ev.push({ k: st.anchors.length > before ? 'anchor' : 'place', p, i: m.i });
        st.fx.fresh.push(m.i); st.last = [m.i];
        E.doCaptures(st, cfg, [[p, m.i]], ev);
        const gone = E.trim(st, cfg, p);
        if (gone >= 0) ev.push({ k: 'vanish', p, i: gone });
      } else if (m.kind === 'shot') {
        st.shots[p]--;
        if (st.anchors.includes(m.i)) ev.push({ k: 'anchorMiss', p, i: m.i });
        else {
          const victim = st.cells[m.i];
          E.remove(st, m.i);
          if (victim) st.scar.push([m.i, victim]);
          st.last = [];
          ev.push({ k: 'hit', p, i: m.i, guessed: false });
        }
      } else if (m.kind === 'unanchor') {
        st.last = [];
        E.takeAnchor(st, cfg, p, m.i, ev);
      } else if (m.kind === 'moveAnchor') {
        st.last = [];
        E.moveAnchor(st, cfg, p, m.i, ev, m.from);
      } else if (m.kind === 'magnet') {
        st.last = [];
        E.doMagnet(st, cfg, p, m.i, ev);
      } else {
        // Ход пропущен: кончилось время.
        ev.push({ k: 'pass', p });
      }
      E.countMiss(st, ev);
      E.bankTick(st, cfg, p, m, ev);
      if (ev.length) E.log(st, tag, ev);
      E.snap(st, tag);
      const w = E.checkWin(st, cfg, p);
      if (w) E.finish(st, p, w, tag);
      else if (!st.cells.includes(0)) E.finish(st, 0, { line: [], reason: 'full' }, tag);
      E.missOut(st, cfg, tag);
      if (!st.over) st.turn = 3 - p;
    },

    // Сдача: победа достаётся сопернику.
    resign(st, cfg, p) {
      if (st.over) return;
      E.resetFx(st);
      const tag = cfg.secret ? 'Р' + st.round : 'Х' + st.moves;
      E.finish(st, 3 - p, { line: [], reason: 'resign' }, tag);
    }
  };

  // ---------- Бот ----------
  function lineScore(b, idx, p, n, win) {
    const r = (idx / n) | 0, c = idx % n, W = weights(win);
    let total = 0;
    for (const [dr, dc] of DIRS) {
      for (let off = 1 - win; off <= 0; off++) {
        let cnt = 0, ok = true;
        for (let k = 0; k < win; k++) {
          const rr = r + (off + k) * dr, cc = c + (off + k) * dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) { ok = false; break; }
          const j = rr * n + cc;
          const v = j === idx ? p : b[j];
          if (v === p) cnt++;
          else if (v !== 0) { ok = false; break; }
        }
        if (ok) total += W[cnt];
      }
    }
    return total;
  }

  function winCellCount(st, cfg, b, p) {
    let k = 0;
    const win = rowLen(cfg);
    for (let i = 0; i < st.n * st.n; i++) if (st.cells[i] === 0 && b[i] === 0 && lineScore(b, i, p, st.n, win) >= WIN) k++;
    return k;
  }

  function botPick(st, cfg, me, vb) {
    const n = st.n, c0 = st.cells, opp = 3 - me, m = n >> 1, win = rowLen(cfg);
    if (!c0.some((v) => v === 1 || v === 2)) {
      const opts = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const j = (m + dr) * n + m + dc;
        if (c0[j] === 0) opts.push(j);
      }
      return { i: opts[(Math.random() * opts.length) | 0], att: 0 };
    }
    const list = [];
    for (let i = 0; i < n * n; i++) {
      if (c0[i] !== 0) continue;
      const r = (i / n) | 0, c = i % n;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const v = c0[rr * n + cc];
        if (v === 1 || v === 2) { near = true; break; }
      }
      if (!near) continue;
      let att = lineScore(vb, i, me, n, win);
      let def = lineScore(vb, i, opp, n, win);
      if (cfg.capture) {
        const ca = E.captures(vb, n, i, me).length / 2;
        const cd = E.captures(vb, n, i, opp).length / 2;
        att += ca * 1500 + (ca && st.caps[me] + ca >= 5 ? WIN : 0);
        def += cd * 1100 + (cd && st.caps[opp] + cd >= 5 ? WIN : 0);
      }
      const s = att + def * 0.9 - (Math.abs(r - m) + Math.abs(c - m)) * 0.3 + Math.random() * 3;
      list.push({ i, s, att });
    }
    if (!list.length) {
      const empty = [];
      c0.forEach((v, i) => { if (v === 0) empty.push(i); });
      return { i: empty[(Math.random() * empty.length) | 0], att: 0 };
    }
    list.sort((a, b) => b.s - a.s);
    const top = list[0];
    if (!cfg.secret || top.s >= WIN / 2) return top;
    const pool = list.filter((x) => x.s >= top.s * 0.7).slice(0, 5);
    const sum = pool.reduce((a, x) => a + x.s, 0);
    let roll = Math.random() * sum;
    for (const x of pool) { roll -= x.s; if (roll <= 0) return x; }
    return top;
  }

  function botDecide(st, cfg, me) {
    const opp = 3 - me, n = st.n;
    const vb = st.cells.slice();
    if (cfg.mem) for (const p of [1, 2]) if (st.q[p].length >= cfg.mem) vb[st.q[p][0]] = 0;
    const pick = botPick(st, cfg, me, vb);
    if (pick.att >= WIN) return { i: pick.i, kind: 'place', anchor: false };
    if (E.canShoot(st, cfg, me)) {
      const threats = winCellCount(st, cfg, vb, opp);
      if (threats >= 2) {
        let best = -1, bestCount = threats;
        for (let s = 0; s < n * n; s++) {
          if (st.cells[s] !== opp || vb[s] !== opp || st.anchors.includes(s)) continue;
          const t = vb.slice(); t[s] = 0;
          const cnt = winCellCount(st, cfg, t, opp);
          if (cnt < bestCount) { bestCount = cnt; best = s; }
        }
        if (best >= 0) return { i: best, kind: 'shot' };
      }
    }
    const anchor = E.anchorOn(cfg) && st.anchorLeft[me] > 0 && pick.att >= 1000;
    return { i: pick.i, kind: 'place', anchor };
  }

  const api = { E, botDecide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GhostEngine = api;
})(typeof self !== 'undefined' ? self : this);
