// Стенд: подменяет клиент Supabase на базу в localStorage, чтобы прогнать две вкладки.
(function () {
  const DB_KEY = 'mockdb';
  const USERS = {
    1: { id: 'u-1111', email: 'one@test.ru', nickname: 'Один' },
    2: { id: 'u-2222', email: 'two@test.ru', nickname: 'Двое' }
  };
  const me = USERS[new URLSearchParams(location.search).get('as') || '1'];

  const TABLES = ['profiles', 'friendships', 'games', 'moves', 'history'];
  const load = () => {
    const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    for (const t of TABLES) if (!db[t]) db[t] = [];
    return db;
  };
  const save = (db) => { localStorage.setItem(DB_KEY, JSON.stringify(db)); localStorage.setItem('mocktick', String(Date.now())); };
  const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

  function ensureProfile() {
    const db = load();
    if (!db.profiles.some((p) => p.id === me.id)) { db.profiles.push({ id: me.id, nickname: me.nickname, rating: 1000, wins: 0, losses: 0, draws: 0 }); save(db); }
    for (const u of Object.values(USERS)) if (!db.profiles.some((p) => p.id === u.id)) { const d = load(); d.profiles.push({ id: u.id, nickname: u.nickname, rating: 1000, wins: 0, losses: 0, draws: 0 }); save(d); }
  }

  // Значение поля с поддержкой путей вида state->over и state->>gameNo
  function val(row, col) {
    const m = col.match(/^(\w+)->>?(.+)$/);
    if (!m) return row[col];
    const v = (row[m[1]] || {})[m[2]];
    return col.includes('->>') ? (v === undefined || v === null ? null : String(v)) : v;
  }

  class Q {
    constructor(table, op, payload) {
      this.table = table; this.op = op || 'select'; this.payload = payload;
      this.tests = []; this.cols = '*'; this.single = false; this.lim = 0; this.ord = null;
    }
    select(cols) { this.cols = cols || '*'; if (this.op !== 'select') this.returning = true; return this; }
    eq(c, v) { this.tests.push((r) => String(val(r, c)) === String(v)); return this; }
    neq(c, v) { this.tests.push((r) => String(val(r, c)) !== String(v)); return this; }
    is(c, v) { this.tests.push((r) => (v === null ? val(r, c) == null : val(r, c) === v)); return this; }
    in(c, arr) { this.tests.push((r) => arr.includes(val(r, c))); return this; }
    ilike(c, pat) { const re = new RegExp('^' + pat.replace(/%/g, '.*'), 'i'); this.tests.push((r) => re.test(val(r, c) || '')); return this; }
    or(expr) {
      const parts = expr.split(',').map((p) => p.split('.'));
      this.tests.push((r) => parts.some(([c, op, v]) => (op === 'eq' ? String(val(r, c)) === v : false)));
      return this;
    }
    order(c, o) { this.ord = [c, o && o.ascending === false ? -1 : 1]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    rows(db) { return db[this.table].filter((r) => this.tests.every((t) => t(r))); }
    project(rows) {
      if (this.cols === '*') return clone(rows);
      const specs = this.cols.split(',').map((s) => {
        const [a, b] = s.includes(':') ? s.split(':') : [null, s];
        return { name: a || s, from: b };
      });
      return rows.map((r) => { const o = {}; specs.forEach((s) => { o[s.name] = clone(val(r, s.from)); }); return o; });
    }
    then(res, rej) { return this.run().then(res, rej); }
    async run() {
      await new Promise((r) => setTimeout(r, 15));
      const db = load();
      try {
        if (this.op === 'select') {
          let rows = this.rows(db);
          if (this.ord) rows = rows.slice().sort((a, b) => {
            const x = val(a, this.ord[0]), y = val(b, this.ord[0]);
            const d = typeof x === 'number' && typeof y === 'number' ? x - y : (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0);
            return d * this.ord[1];
          });
          if (this.lim) rows = rows.slice(0, this.lim);
          const out = this.project(rows);
          return { data: this.single ? out[0] || null : out, error: null };
        }
        if (this.op === 'insert') {
          // Код партии уникален только в самих партиях: в истории он повторяется по раундам.
          if (this.table === 'games' && db.games.some((r) => r.code && r.code === this.payload.code)) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          if (this.table === 'history' && !this.payload.id) this.payload.id = 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
          db[this.table].push(Object.assign({ updated_at: new Date().toISOString() }, this.payload));
          save(db);
          return { data: null, error: null };
        }
        if (this.op === 'upsert') {
          const keys = this.table === 'moves' ? ['game_code', 'seat'] : ['id'];
          const i = db[this.table].findIndex((r) => keys.every((k) => r[k] === this.payload[k]));
          if (i >= 0) db[this.table][i] = Object.assign(db[this.table][i], this.payload);
          else db[this.table].push(Object.assign({}, this.payload));
          save(db);
          return { data: null, error: null };
        }
        if (this.op === 'update') {
          const rows = this.rows(db);
          rows.forEach((r) => Object.assign(r, this.payload, { updated_at: new Date().toISOString() }));
          save(db);
          return { data: null, error: null };
        }
        if (this.op === 'delete') {
          const keep = db[this.table].filter((r) => !this.tests.every((t) => t(r)));
          db[this.table] = keep;
          save(db);
          return { data: null, error: null };
        }
      } catch (e) { return { data: null, error: { message: String(e) } }; }
      return { data: null, error: null };
    }
  }

  const rpcs = {
    nickname_available: ({ n }, db) => !db.profiles.some((p) => p.nickname.toLowerCase() === String(n).trim().toLowerCase()),
    send_friend_request: ({ nick }, db) => {
      const them = db.profiles.find((p) => p.nickname.toLowerCase() === String(nick).trim().toLowerCase());
      if (!them) throw new Error('Игрок с ником ' + nick + ' не найден');
      if (them.id === me.id) throw new Error('Это ваш собственный ник');
      const back = db.friendships.find((f) => f.requester === them.id && f.addressee === me.id);
      if (back) { if (back.status === 'pending') { back.status = 'accepted'; return 'accepted'; } return 'already'; }
      const mine = db.friendships.find((f) => f.requester === me.id && f.addressee === them.id);
      if (mine) return mine.status === 'accepted' ? 'already' : 'pending';
      db.friendships.push({ requester: me.id, addressee: them.id, status: 'pending' });
      return 'sent';
    },
    respond_friend_request: ({ other, accept }, db) => {
      const i = db.friendships.findIndex((f) => f.requester === other && f.addressee === me.id && f.status === 'pending');
      if (i < 0) return null;
      if (accept) db.friendships[i].status = 'accepted'; else db.friendships.splice(i, 1);
      return null;
    },
    remove_friend: ({ other }, db) => {
      db.friendships = db.friendships.filter((f) => !((f.requester === me.id && f.addressee === other) || (f.requester === other && f.addressee === me.id)));
      return null;
    },
    join_game: ({ g, my_look }, db) => {
      const game = db.games.find((x) => x.code === g);
      if (!game || game.p2 || game.status !== 'waiting' || game.p1 === me.id) return null;
      if (game.invitee && game.invitee !== me.id) return null;
      game.p2 = me.id; game.status = 'playing';
      game.looks = Object.assign({}, game.looks, { 2: my_look });
      return g;
    },
    report_result: ({ g }, db) => {
      const game = db.games.find((x) => x.code === g);
      if (!game || game.rated || !game.p2 || !game.state || !game.state.over) return null;
      // Как в базе: рейтинг меняется один раз за партию, когда кто-то взял два раунда.
      const sc = game.score || {};
      const w = (+sc['1'] || 0) >= 2 ? 1 : (+sc['2'] || 0) >= 2 ? 2 : 0;
      if (!w) return null;
      const a = db.profiles.find((x) => x.id === game.p1), b = db.profiles.find((x) => x.id === game.p2);
      if (!a || !b) return null;
      const e1 = 1 / (1 + Math.pow(10, ((b.rating || 1000) - (a.rating || 1000)) / 400));
      const s1 = w === 1 ? 1 : 0;
      a.rating = Math.max(100, Math.round((a.rating || 1000) + 24 * (s1 - e1)));
      b.rating = Math.max(100, Math.round((b.rating || 1000) + 24 * ((1 - s1) - (1 - e1))));
      a.wins = (a.wins || 0) + (w === 1 ? 1 : 0); a.losses = (a.losses || 0) + (w === 2 ? 1 : 0);
      b.wins = (b.wins || 0) + (w === 2 ? 1 : 0); b.losses = (b.losses || 0) + (w === 1 ? 1 : 0);
      game.rated = true;
      return w;
    },
    decline_game: ({ g }, db) => {
      const game = db.games.find((x) => x.code === g && x.invitee === me.id && !x.p2);
      if (game) game.status = 'declined';
      return null;
    }
  };

  const listeners = [];
  window.addEventListener('storage', (e) => { if (e.key === 'mocktick') listeners.forEach((fn) => fn()); });

  const session = { user: { id: me.id, email: me.email } };
  const client = {
    auth: {
      onAuthStateChange: (cb) => { setTimeout(() => cb('SIGNED_IN', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session }, error: null }),
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session }, error: null }),
      verifyOtp: async () => ({ error: null }),
      resend: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => ({ error: null })
    },
    from: (t) => ({
      select: (c) => new Q(t, 'select').select(c),
      insert: (p) => new Q(t, 'insert', p),
      upsert: (p) => new Q(t, 'upsert', p),
      update: (p) => new Q(t, 'update', p),
      delete: () => new Q(t, 'delete')
    }),
    rpc: async (name, args) => {
      await new Promise((r) => setTimeout(r, 15));
      const db = load();
      try { const data = rpcs[name](args || {}, db); save(db); return { data: data === undefined ? null : data, error: null }; }
      catch (e) { return { data: null, error: { message: e.message } }; }
    },
    channel: () => {
      const handlers = [];
      const ch = {
        on(_a, _b, fn) { handlers.push(fn); listeners.push(fn); return ch; },
        subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 10); return ch; }
      };
      return ch;
    },
    removeChannel: () => {}
  };

  ensureProfile();
  window.supabase = { createClient: () => client };
  window.MOCK = { me, reset: () => localStorage.removeItem(DB_KEY), db: load };
})();
