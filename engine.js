// «Призрачная пятёрка»: правила игры и бот.
// Чистые функции над простым JSON-состоянием, одинаковые у обоих игроков.
(function (root) {
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const WIN = 1000000;
  // Веса для «сколько своих фишек в окне»: отдельные для ряда из пяти и из четырёх.
  const W5 = [0, 2, 30, 500, 9000, WIN];
  const W4 = [0, 3, 60, 2000, WIN];
  const weights = (win) => (win === 4 ? W4 : W5);
  const rowLen = (cfg) => (cfg.win === 4 ? 4 : 5);
  // Сколько ходов якорь стоит, прежде чем его можно забрать обратно.
  const ANCHOR_HOLD = 5;
  // Сколько ходов подряд можно пропустить, прежде чем засчитают поражение.
  const MISS_LIMIT = 3;

  const E = {
    ANCHOR_HOLD,
    MISS_LIMIT,
    rowLen,
    anchorOn: (cfg) => !!cfg.anchor && cfg.mem > 0,

    make(cfg, starter, gameNo) {
      const n = cfg.size;
      const st = {
        n, cells: new Array(n * n).fill(0), q: { 1: [], 2: [] }, anchors: [], anchorAt: { 1: 0, 2: 0 },
        anchorLeft: { 1: 1, 2: 1 }, shots: { 1: cfg.shots, 2: cfg.shots }, caps: { 1: 0, 2: 0 },
        walls: [], scar: [], misses: { 1: 0, 2: 0 }, bank: { 1: cfg.bank || 0, 2: cfg.bank || 0 },
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

    resetFx(st) { st.fx = { fresh: [], gone: [], burn: -1 }; },

    // Запас времени: сколько секунд игрок добрал сверх основного лимита.
    spend(st, p, sec) {
      if (!sec) return;
      if (!st.bank) st.bank = { 1: 0, 2: 0 };
      st.bank[p] = Math.max(0, (st.bank[p] || 0) - Math.max(0, Math.round(sec)));
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
        if (!st.anchorAt) st.anchorAt = { 1: 0, 2: 0 };
        st.anchorAt[p] = E.clock(st, cfg);
      } else st.q[p].push(i);
    },

    anchorOf(st, p) {
      for (const i of st.anchors) if (st.cells[i] === p) return i;
      return -1;
    },
    anchorAge(st, cfg, p) {
      const at = (st.anchorAt && st.anchorAt[p]) || 0;
      return E.clock(st, cfg) - at;
    },
    // Якорь можно забрать обратно, когда он простоял своё; он снова идёт в запас.
    canUnanchor(st, cfg, p) {
      if (!E.anchorOn(cfg) || st.over) return false;
      return E.anchorOf(st, p) >= 0 && E.anchorAge(st, cfg, p) >= ANCHOR_HOLD;
    },
    takeAnchor(st, cfg, p, ev) {
      const i = E.anchorOf(st, p);
      if (i < 0 || !E.canUnanchor(st, cfg, p)) return false;
      E.remove(st, i);
      st.anchorLeft[p]++;
      ev.push({ k: 'unanchor', p, i });
      return true;
    },

    remove(st, i) {
      const p = st.cells[i];
      if (p !== 1 && p !== 2) return;
      st.cells[i] = 0;
      st.q[p] = st.q[p].filter((x) => x !== i);
      st.anchors = st.anchors.filter((x) => x !== i);
      st.fx.gone.push([i, p]);
    },

    trim(st, cfg, p) {
      if (!cfg.mem || st.q[p].length <= cfg.mem) return -1;
      const i = st.q[p][0];
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

    wallTick(st, cfg, skip) {
      if (!cfg.wallTtl) return 0;
      let cooled = 0;
      const keep = [];
      for (const [i, t] of st.walls) {
        if (i === skip) { keep.push([i, t]); continue; }
        if (t <= 1) { st.cells[i] = 0; cooled++; } else keep.push([i, t - 1]);
      }
      st.walls = keep;
      return cooled;
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
      if (kind === 'unanchor') return v === p && st.anchors.includes(i) && E.canUnanchor(st, cfg, p);
      if (kind === 'moveAnchor') return E.anchorOn(cfg) && E.canMoveAnchor(st, cfg, p, i);
      return false;
    },

    canShoot(st, cfg, p) {
      if (!(cfg.shots > 0 && st.shots[p] > 0)) return false;
      if (cfg.secret) return true;
      return st.cells.some((v, i) => v === 3 - p && !st.anchors.includes(i));
    },

    // Якорь можно сдвинуть на соседнюю клетку; стена на пути ломается.
    moveAnchor(st, cfg, p, to, ev) {
      const from = E.anchorOf(st, p);
      if (from < 0 || !E.canMoveAnchor(st, cfg, p, to)) return false;
      const wall = st.cells[to] === 3;
      if (wall) st.walls = st.walls.filter(([wi]) => wi !== to);
      st.cells[from] = 0;
      st.anchors = st.anchors.filter((x) => x !== from);
      st.cells[to] = p;
      st.anchors.push(to);
      st.fx.gone.push([from, p]);
      st.fx.fresh.push(to);
      ev.push({ k: 'anchorMove', p, from, i: to, wall });
      return true;
    },
    // Якорем можно сделать и фишку, которая уже стоит на поле.
    setAnchor(st, cfg, p, i, ev) {
      if (!E.anchorOn(cfg) || st.anchorLeft[p] <= 0) return false;
      if (st.cells[i] !== p || st.anchors.includes(i)) return false;
      st.q[p] = st.q[p].filter((x) => x !== i);
      st.anchors.push(i);
      st.anchorLeft[p]--;
      if (!st.anchorAt) st.anchorAt = { 1: 0, 2: 0 };
      st.anchorAt[p] = E.clock(st, cfg);
      st.fx.fresh.push(i);
      ev.push({ k: 'anchorSet', p, i });
      return true;
    },
    canAnchor: (st, cfg, p) => E.anchorOn(cfg) && st.anchorLeft[p] > 0,

    canMoveAnchor(st, cfg, p, to) {
      const from = E.anchorOf(st, p);
      if (from < 0) return false;
      const n = st.n, r = (from / n) | 0, c = from % n, rr = (to / n) | 0, cc = to % n;
      if (Math.abs(r - rr) > 1 || Math.abs(c - cc) > 1 || from === to) return false;
      return st.cells[to] === 0 || st.cells[to] === 3;
    },

    // Тайный ход: оба хода открываются одновременно.
    resolveRound(st, cfg, m1, m2) {
      E.resetFx(st);
      st.scar = [];
      const tag = 'Р' + st.round, ev = [], placed = [];
      // Якорь забирают бесплатно и до самого хода: освободившаяся клетка сразу годится.
      for (const [p, m] of [[1, m1], [2, m2]]) E.spend(st, p, m.spent);
      for (const [p, m] of [[1, m1], [2, m2]]) if (m.take) E.takeAnchor(st, cfg, p, ev);
      // Ход «якорь» на пустую клетку — это тоже постановка фишки.
      const putting = (m) => (m.kind === 'place' || m.kind === 'anchor') && st.cells[m.i] === 0;
      let kind = '', newWall = -1;
      if (putting(m1) && putting(m2) && m1.i === m2.i) {
        st.cells[m1.i] = 3;
        st.walls.push([m1.i, cfg.wallTtl || 0]);
        newWall = m1.i; st.fx.burn = m1.i; st.last = [];
        ev.push({ k: 'burn', i: m1.i }); kind = 'burn';
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
          if (m.kind === 'unanchor') E.takeAnchor(st, cfg, p, ev);
          else if (m.kind === 'moveAnchor') E.moveAnchor(st, cfg, p, m.i, ev);
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
      const cooled = E.wallTick(st, cfg, newWall);
      if (cooled) ev.push({ k: 'cool', n: cooled });
      E.countMiss(st, ev);
      E.log(st, tag, ev, kind);
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
      if (m.take) E.takeAnchor(st, cfg, p, ev);
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
        E.takeAnchor(st, cfg, p, ev);
      } else if (m.kind === 'moveAnchor') {
        st.last = [];
        E.moveAnchor(st, cfg, p, m.i, ev);
      } else {
        // Ход пропущен: кончилось время.
        ev.push({ k: 'pass', p });
      }
      E.countMiss(st, ev);
      if (ev.length) E.log(st, tag, ev);
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
