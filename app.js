// «Призрачная пятёрка»: интерфейс, локальная игра и игра по сети через Supabase.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { E, botDecide } = window.GhostEngine;
  const boardEl = $('board');

  const COLORS = [
    { id: 'cobalt', name: 'Кобальт', nom: 'кобальтовые', gen: 'кобальтовых' },
    { id: 'coral', name: 'Коралл', nom: 'коралловые', gen: 'коралловых' },
    { id: 'emerald', name: 'Изумруд', nom: 'изумрудные', gen: 'изумрудных' },
    { id: 'amber', name: 'Янтарь', nom: 'янтарные', gen: 'янтарных' },
    { id: 'violet', name: 'Фиалка', nom: 'фиолетовые', gen: 'фиолетовых' },
    { id: 'teal', name: 'Бирюза', nom: 'бирюзовые', gen: 'бирюзовых' },
    { id: 'rose', name: 'Малина', nom: 'малиновые', gen: 'малиновых' },
    { id: 'graphite', name: 'Графит', nom: 'графитовые', gen: 'графитовых' }
  ];
  const SHAPES = [
    { id: 'circle', name: 'Круг' }, { id: 'ring', name: 'Кольцо' }, { id: 'cross', name: 'Крест' },
    { id: 'square', name: 'Квадрат' }, { id: 'diamond', name: 'Ромб' }, { id: 'star', name: 'Звезда' }
  ];
  const CFG_KEYS = ['size', 'secret', 'wallTtl', 'mem', 'anchor', 'shots', 'capture'];
  const NICK_RE = /^[A-Za-zА-Яа-яЁё0-9_.-]{3,20}$/;
  const CODE_RE = /^[A-Z0-9]{4,8}$/;

  // ---------- Settings (per browser) ----------
  const S = {
    opp: 'bot', theme: 'auto',
    size: 13, secret: true, wallTtl: 5, mem: 8, anchor: true, shots: 1, capture: false,
    look: { 1: { color: 'cobalt', shape: 'circle' }, 2: { color: 'coral', shape: 'diamond' } }
  };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  try {
    const saved = JSON.parse(lsGet('ghost5-settings') || 'null');
    if (saved && typeof saved === 'object') {
      for (const k of ['opp', 'theme'].concat(CFG_KEYS)) if (k in saved) S[k] = saved[k];
      for (const p of [1, 2]) {
        const l = saved.look && saved.look[p];
        if (l && COLORS.some((c) => c.id === l.color)) S.look[p].color = l.color;
        if (l && SHAPES.some((s) => s.id === l.shape)) S.look[p].shape = l.shape;
      }
    }
  } catch (e) {}
  // Прошлые версии держали «по сети» третьим соперником; теперь это отдельный раздел.
  if (!['bot', 'friend'].includes(S.opp)) S.opp = 'bot';
  if (!['auto', 'light', 'dark'].includes(S.theme)) S.theme = 'auto';
  const save = () => lsSet('ghost5-settings', JSON.stringify(S));
  const pickCfg = (src) => { const c = {}; CFG_KEYS.forEach((k) => { c[k] = src[k]; }); return c; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- Supabase ----------
  const CONF = window.GHOST_CONFIG || {};
  const placeholder = (s) => !s || /ВАШ|YOUR/i.test(s);
  const configured = !placeholder(CONF.supabaseUrl) && !placeholder(CONF.supabaseKey);
  let sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    try {
      sb = window.supabase.createClient(CONF.supabaseUrl, CONF.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { sb = null; }
  }
  const siteUrl = () => location.origin + location.pathname;

  // ---------- Controller state ----------
  // Разделы приложения: вход, игра на этом устройстве, лобби, онлайн-партия, вид, профиль.
  const ROUTES = ['auth', 'play', 'online', 'game', 'look', 'profile'];
  const TABS = ['play', 'online', 'look', 'profile'];
  const R = { route: 'auth' };
  const online = () => R.route === 'game';
  const Lc = { st: null, cfg: null, phase: 'pick', pending1: null, score: { 1: 0, 2: 0, d: 0 }, starter: 2 };
  const ui = { sel: null, action: 'place', useAnchor: false };
  let busy = false;
  const O = {
    // account
    authReady: false, myId: null, email: '', profile: undefined, recovery: false, guest: false,
    authView: 'login', authEmail: '', authBusy: false, authMsg: '', authErr: false,
    profileMsg: '', profileErr: false,
    // home
    friends: [], games: [], invites: [], names: {}, homeMsg: '', friendMsg: '', friendErr: false,
    homeChan: null, homePoll: null, homeSeq: 0, confirmRemove: null,
    // one game
    code: null, game: null, st: null, moves: { 1: null, 2: null }, notFound: false,
    chan: null, poll: null, live: false, lastFetch: 0, fetchSeq: 0,
    plain: null, revealing: '', resolving: '', committing: false, joining: false, creating: false,
    msg: ''
  };
  const params = new URLSearchParams(location.search);
  let pendingCode = (params.get('g') || lsGet('ghost5-pending') || '').toUpperCase();
  if (!CODE_RE.test(pendingCode)) pendingCode = '';
  function setPending(code) { pendingCode = code || ''; lsSet('ghost5-pending', code || null); }

  // ---------- Навигация по разделам ----------
  const signedIn = () => (!!O.myId && !O.recovery) || O.guest;
  function go(route) {
    if (!ROUTES.includes(route)) route = signedIn() ? 'play' : 'auth';
    if (route !== 'game' && R.route === 'game') closeGame();
    const was = R.route;
    R.route = route;
    if (was !== route) resetUi();
    syncHash();
    if (route === 'online' && O.myId) refreshHome();
    render();
    if (route === 'play' && was !== 'play') maybeBot();
  }
  function syncHash() {
    const want = '#/' + R.route;
    if (R.route === 'auth' || location.hash === want) return;
    try { history.replaceState(null, '', location.pathname + location.search + want); } catch (e) {}
  }
  function routeFromHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    return TABS.includes(h) ? h : '';
  }

  const curSt = () => (online() ? O.st : Lc.st);
  const curCfg = () => (online() ? (O.game ? O.game.cfg : pickCfg(S)) : Lc.cfg);
  const curLooks = () => (online() && O.game && O.game.looks ? O.game.looks : S.look);
  const lookOf = (p) => curLooks()[p] || S.look[p];
  const colorOf = (p) => COLORS.find((c) => c.id === lookOf(p).color) || COLORS[0];
  const capWord = (s) => s[0].toUpperCase() + s.slice(1);
  const resetUi = () => { ui.sel = null; ui.action = 'place'; ui.useAnchor = false; };

  function mySeat() {
    if (!O.game || !O.myId) return 0;
    return O.game.p1 === O.myId ? 1 : O.game.p2 === O.myId ? 2 : 0;
  }
  const inOnlineGame = () => !!O.game && !!mySeat();
  function moveCurrent(d, st) { return !!(d && st && d.gameNo === st.gameNo && d.round === st.round && d.commit); }
  function hasPlain(st) { return !!(O.plain && st && O.plain.gameNo === st.gameNo && O.plain.round === st.round); }
  function seatDone(seat) {
    const st = O.st, d = O.moves[seat];
    if (!moveCurrent(d, st)) return false;
    if (seat === mySeat()) return !!d.reveal || hasPlain(st);
    return true;
  }

  function picker() {
    const st = curSt();
    if (!st || st.over) return 0;
    if (!online()) {
      if (Lc.cfg.secret) return Lc.phase === 'pick1' ? 1 : Lc.phase === 'pick2' ? 2 : 0;
      return st.turn;
    }
    const me = mySeat(), g = O.game;
    if (!me || !g.p2 || O.committing) return 0;
    if (g.cfg.secret) return seatDone(me) ? 0 : me;
    return st.turn === me ? me : 0;
  }
  const isHuman = (p) => online() || S.opp === 'friend' || p === 1;

  const nameOf = (uid) => (uid === O.myId ? 'Вы' : O.names[uid] || 'Игрок');
  function names() {
    if (!online()) return S.opp === 'bot' ? { 1: 'Вы', 2: 'Бот' } : { 1: 'Игрок 1', 2: 'Игрок 2' };
    const g = O.game;
    if (!g) return { 1: 'Вы', 2: 'Соперник' };
    return { 1: nameOf(g.p1), 2: g.p2 ? nameOf(g.p2) : g.invitee ? nameOf(g.invitee) : 'Ждём игрока' };
  }
  function resultText(w, reason) {
    if (!w) return reason === 'both' ? 'Ничья: победа у обоих в одном раунде.' : 'Ничья: поле заполнено.';
    const who = names()[w];
    if (who === 'Вы') return reason === 'caps' ? 'Победа! Вы захватили 5 пар.' : 'Победа! Вы собрали пятёрку.';
    return who + (reason === 'caps' ? ' захватывает 5 пар.' : ' собирает пятёрку.');
  }
  function evText(e) {
    const N = (p) => capWord(colorOf(p).nom), G = (p) => colorOf(p).gen;
    switch (e.k) {
      case 'start': return e.secret ? 'Новая партия. Оба ходят одновременно.' : 'Новая партия. Первыми ходят ' + colorOf(e.starter).nom + '.';
      case 'open': return 'Ходы открыты.';
      case 'burn': return 'Оба выбрали одну клетку. Она сгорела.';
      case 'anchor': return N(e.p) + ' поставили якорь.';
      case 'hit': return e.guessed ? N(e.p) + ' угадали ход и сбили новую фишку!' : N(e.p) + ' сбили фишку ' + G(3 - e.p) + '.';
      case 'miss': return N(e.p) + ' выстрелили мимо.';
      case 'cap': return N(e.p) + ' захватили ' + (e.n === 1 ? 'пару' : 'пары: ' + e.n) + ' (' + e.total + '/5).';
      case 'vanish': return 'Исчезла старая фишка ' + G(e.p) + '.';
      case 'cool': return e.n === 1 ? 'Одна стена остыла.' : 'Остыло стен: ' + e.n + '.';
      case 'result': return resultText(e.w, e.reason);
      default: return '';
    }
  }
  function cfgSummary(cfg) {
    if (!cfg) return '';
    const parts = [cfg.size + '×' + cfg.size];
    if (cfg.secret) parts.push('тайный ход');
    if (cfg.mem) parts.push('память ' + cfg.mem);
    if (E.anchorOn(cfg)) parts.push('якорь');
    if (cfg.shots) parts.push('выстрелы ' + cfg.shots);
    if (cfg.capture) parts.push('захват');
    return parts.join(' · ');
  }

  // ---------- Local play ----------
  function newLocal() {
    Lc.starter = 3 - Lc.starter;
    Lc.cfg = pickCfg(S);
    Lc.st = E.make(Lc.cfg, Lc.starter, 1);
    Lc.phase = Lc.cfg.secret ? 'pick1' : 'pick';
    Lc.pending1 = null; busy = false;
    resetUi();
    render();
    maybeBot();
  }
  function bumpScore(score, st) { const k = st.winner ? String(st.winner) : 'd'; score[k] = (score[k] || 0) + 1; }
  function localRound(m1, m2) {
    const st = Lc.st;
    E.resolveRound(st, Lc.cfg, m1, m2);
    if (st.over) bumpScore(Lc.score, st);
    Lc.phase = 'pick1'; Lc.pending1 = null;
    render();
  }
  function localSeq(p, m) {
    const st = Lc.st;
    E.resolveSeq(st, Lc.cfg, p, m);
    if (st.over) bumpScore(Lc.score, st);
    render();
    maybeBot();
  }
  function maybeBot() {
    const st = Lc.st;
    if (online() || S.opp !== 'bot' || st.over || Lc.cfg.secret || st.turn !== 2) return;
    busy = true;
    render();
    setTimeout(() => {
      busy = false;
      if (Lc.st !== st || S.opp !== 'bot') { render(); return; }
      localSeq(2, botDecide(st, Lc.cfg, 2));
    }, 650);
  }

  // ---------- Moves (shared entry point) ----------
  boardEl.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) onCell(+b.dataset.i);
  });
  function onCell(i) {
    const st = curSt();
    if (!st || st.over || busy) return;
    const p = picker();
    if (!p || !isHuman(p) || !E.validTarget(st, curCfg(), p, i, ui.action)) return;
    if (ui.sel === i) { confirmMove(); return; }
    ui.sel = i;
    render();
  }
  function setAction(a) {
    const st = curSt(), p = picker();
    if (!st || !p || !isHuman(p) || busy) return;
    if (a === 'shot' && !E.canShoot(st, curCfg(), p)) return;
    ui.action = a;
    if (a === 'shot') ui.useAnchor = false;
    if (ui.sel !== null && !E.validTarget(st, curCfg(), p, ui.sel, a)) ui.sel = null;
    render();
  }
  function confirmMove() {
    const st = curSt();
    if (!st) return;
    if (st.over) {
      if (online()) { if (mySeat()) onlineRematch(); } else newLocal();
      return;
    }
    const p = picker();
    if (!p || !isHuman(p) || ui.sel === null || busy) return;
    const cfg = curCfg();
    const m = { i: ui.sel, kind: ui.action, anchor: ui.action === 'place' && ui.useAnchor && E.anchorOn(cfg) && st.anchorLeft[p] > 0 };
    resetUi();
    if (online()) { if (cfg.secret) commitMove(m); else onlineSeq(m); return; }
    if (cfg.secret) {
      if (Lc.phase === 'pick1') {
        Lc.pending1 = m;
        if (S.opp === 'bot') localRound(m, botDecide(st, cfg, 2));
        else { Lc.phase = 'handoff'; render(); }
      } else if (Lc.phase === 'pick2') localRound(Lc.pending1, m);
    } else localSeq(p, m);
  }

  // ---------- Online: helpers ----------
  function errText(error) {
    const m = (error && (error.message || '')) + ' ' + (error && error.code ? error.code : '');
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    if (/row-level security|42501|permission denied/i.test(m)) return 'Сервер не разрешил это действие.';
    return (error && error.message) || 'ошибка сервера';
  }
  function gameErr(error, what) {
    if (!error) return false;
    O.msg = (what ? what + ': ' : '') + errText(error);
    O.committing = false; O.creating = false; O.joining = false;
    render();
    return true;
  }
  function randSalt() {
    try { const a = new Uint32Array(4); crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(36)).join(''); }
    catch (e) { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  async function hashPlain(pl) {
    const str = [pl.gameNo, pl.round, pl.i, pl.kind, pl.anchor ? 1 : 0, pl.salt].join('|');
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 2166136261;
      for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
      return 'f' + (h >>> 0).toString(16);
    }
  }
  const savePlain = (code, pl) => lsSet('ghost5-plain-' + code, JSON.stringify(pl));
  function loadPlain(code) { try { return JSON.parse(lsGet('ghost5-plain-' + code) || 'null'); } catch (e) { return null; } }
  function genCode() {
    const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let k = 0; k < 6; k++) s += al[(Math.random() * al.length) | 0];
    return s;
  }
  function otherFreeColor(taken) { return (COLORS.find((x) => x.id !== taken && x.id !== 'graphite') || COLORS[1]).id; }
  function gameLink(code) { return siteUrl() + '?g=' + code; }
  function setUrlCode(code) {
    try {
      const u = new URL(location.href);
      if (code) u.searchParams.set('g', code); else u.searchParams.delete('g');
      history.replaceState(null, '', u.pathname + u.search);
    } catch (e) {}
  }
  async function fetchNames(ids) {
    const need = [...new Set(ids.filter(Boolean))];
    if (!sb || !need.length) return;
    const { data } = await sb.from('profiles').select('id,nickname').in('id', need);
    let changed = false;
    (data || []).forEach((r) => { if (O.names[r.id] !== r.nickname) { O.names[r.id] = r.nickname; changed = true; } });
    if (changed) render();
  }

  // ---------- Online: account ----------
  function authFail(msg) { O.authBusy = false; O.authErr = true; O.authMsg = msg; render(); }
  function authOk(msg) { O.authBusy = false; O.authErr = false; O.authMsg = msg || ''; render(); }
  function authErrText(error) {
    const m = (error && error.message) || '';
    if (/Invalid login credentials/i.test(m)) return 'Неверный email или пароль.';
    if (/Email not confirmed/i.test(m)) return 'Email ещё не подтверждён.';
    if (/already registered|already been registered|User already exists/i.test(m)) return 'Этот email уже зарегистрирован. Войдите или восстановите пароль.';
    if (/Password should be|password.*(short|least)/i.test(m)) return 'Пароль слишком короткий: нужно не меньше 8 символов.';
    if (/weak|pwned|leaked/i.test(m)) return 'Пароль слишком простой. Придумайте другой.';
    if (/expired|invalid.*(otp|token)|Token has expired/i.test(m)) return 'Код не подошёл или устарел. Запросите новый.';
    if (/rate limit|too many|seconds/i.test(m)) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
    if (/Error sending|smtp/i.test(m)) return 'Не получилось отправить письмо. Проверьте настройку почты в Supabase (SMTP).';
    if (/signups not allowed|Signups not allowed/i.test(m)) return 'Регистрация в проекте выключена (Supabase → Authentication → Sign In / Providers).';
    return errText(error);
  }
  function redirectUrl() { return siteUrl() + (pendingCode ? '?g=' + pendingCode : ''); }

  async function initAuth() {
    if (!sb) { O.authReady = true; render(); return; }
    sb.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') { O.recovery = true; O.authView = 'reset'; O.authMsg = ''; }
        applySession(session);
      }, 0);
    });
    const { data } = await sb.auth.getSession();
    applySession(data && data.session);
  }
  function applySession(session) {
    const uid = session && session.user ? session.user.id : null;
    const changed = uid !== O.myId || !O.authReady;
    O.authReady = true;
    O.myId = uid;
    O.email = session && session.user ? session.user.email || '' : '';
    if (!changed) { render(); return; }
    O.names = {};
    if (uid) {
      O.profile = undefined;
      O.guest = false;
      if (!O.recovery) { O.authView = 'login'; O.authMsg = ''; O.authErr = false; }
      loadProfile();
      startHome();
      if (pendingCode && !O.recovery) { const c = pendingCode; setPending(''); openGame(c, true); return; }
      go(O.recovery ? 'auth' : routeFromHash() || 'play');
      return;
    }
    O.profile = undefined;
    O.recovery = false;
    stopHome();
    go('auth');
  }
  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('id,nickname').eq('id', O.myId).maybeSingle();
    if (error) { O.profile = null; O.homeMsg = 'Не удалось загрузить профиль: ' + errText(error); render(); return; }
    O.profile = data || null;
    if (data) O.names[data.id] = data.nickname;
    render();
  }

  async function doLogin(email, pass) {
    O.authBusy = true; O.authMsg = ''; render();
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error) { authOk(''); return; }
    if (/Email not confirmed/i.test(error.message || '')) {
      O.authEmail = email; O.authView = 'confirm';
      await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl() } });
      authOk('Email ещё не подтверждён. Мы отправили письмо повторно.');
      return;
    }
    authFail(authErrText(error));
  }

  async function doSignup(nick, email, pass) {
    if (!NICK_RE.test(nick)) return authFail('Ник: 3–20 символов, только буквы, цифры, точка, дефис и подчёркивание.');
    if (pass.length < 8) return authFail('Пароль должен быть не короче 8 символов.');
    O.authBusy = true; O.authMsg = ''; render();
    const free = await sb.rpc('nickname_available', { n: nick });
    if (!free.error && free.data === false) return authFail('Ник «' + nick + '» уже занят. Придумайте другой.');
    const { data, error } = await sb.auth.signUp({
      email, password: pass,
      options: { data: { nickname: nick }, emailRedirectTo: redirectUrl() }
    });
    if (error) return authFail(authErrText(error));
    if (data && data.session) { authOk(''); return; }
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return authFail('Этот email уже зарегистрирован. Войдите или восстановите пароль.');
    }
    O.authEmail = email; O.authView = 'confirm';
    authOk('');
  }

  async function doConfirm(code) {
    O.authBusy = true; O.authMsg = ''; render();
    let { error } = await sb.auth.verifyOtp({ email: O.authEmail, token: code, type: 'email' });
    if (error) {
      const r2 = await sb.auth.verifyOtp({ email: O.authEmail, token: code, type: 'signup' });
      if (!r2.error) error = null;
    }
    if (error) return authFail(authErrText(error));
    authOk('');
  }
  async function doResend() {
    if (!O.authEmail) return;
    O.authBusy = true; render();
    const { error } = await sb.auth.resend({ type: 'signup', email: O.authEmail, options: { emailRedirectTo: redirectUrl() } });
    if (error) return authFail(authErrText(error));
    authOk('Письмо отправлено ещё раз.');
  }
  async function doForgot(email) {
    O.authBusy = true; O.authMsg = ''; render();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (error) return authFail(authErrText(error));
    O.authEmail = email; O.authView = 'reset';
    authOk('');
  }
  async function doReset(code, pass) {
    if (pass.length < 8) return authFail('Пароль должен быть не короче 8 символов.');
    O.authBusy = true; O.authMsg = ''; render();
    if (!O.recovery) {
      if (!code) return authFail('Введите код из письма.');
      const { error } = await sb.auth.verifyOtp({ email: O.authEmail, token: code, type: 'recovery' });
      if (error) return authFail(authErrText(error));
    }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) return authFail(authErrText(error));
    O.recovery = false; O.authView = 'login';
    O.homeMsg = 'Пароль изменён.';
    authOk('');
  }
  async function saveNick(nick) {
    if (!NICK_RE.test(nick)) { O.profileErr = true; O.profileMsg = 'Ник: 3–20 символов, только буквы, цифры, точка, дефис и подчёркивание.'; render(); return; }
    O.authBusy = true; render();
    const { error } = await sb.from('profiles').upsert({ id: O.myId, nickname: nick });
    O.authBusy = false;
    if (error) {
      O.profileErr = true;
      O.profileMsg = error.code === '23505' || /duplicate|unique/i.test(error.message) ? 'Ник «' + nick + '» уже занят.' : 'Не удалось сохранить ник: ' + errText(error);
      render();
      return;
    }
    O.profile = { id: O.myId, nickname: nick };
    O.names[O.myId] = nick;
    O.profileErr = false; O.profileMsg = 'Ник сохранён.';
    render();
  }
  async function changePass(pass) {
    if (pass.length < 8) { O.profileErr = true; O.profileMsg = 'Пароль должен быть не короче 8 символов.'; render(); return; }
    O.authBusy = true; render();
    const { error } = await sb.auth.updateUser({ password: pass });
    O.authBusy = false;
    O.profileErr = !!error;
    O.profileMsg = error ? authErrText(error) : 'Пароль изменён.';
    if (!error) $('newPass').value = '';
    render();
  }

  // ---------- Online: home (friends, invites, my games) ----------
  function startHome() {
    if (!sb || !O.myId) return;
    stopHome();
    refreshHome();
    O.homeChan = sb.channel('home-' + O.myId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => scheduleHome())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => scheduleHome())
      .subscribe();
    O.homePoll = setInterval(() => { if (R.route === 'online') refreshHome(); }, 20000);
  }
  function stopHome() {
    if (O.homeChan) { sb.removeChannel(O.homeChan); O.homeChan = null; }
    if (O.homePoll) { clearInterval(O.homePoll); O.homePoll = null; }
  }
  let homeTimer = null;
  function scheduleHome() {
    clearTimeout(homeTimer);
    homeTimer = setTimeout(() => { if (O.myId) refreshHome(); }, 300);
  }
  async function refreshHome() {
    const me = O.myId;
    if (!sb || !me) return;
    // Запросы могут вернуться не в том порядке, в каком ушли: старый ответ не должен затирать свежий.
    const seq = ++O.homeSeq;
    const cols = 'code,p1,p2,invitee,status,cfg,updated_at,over:state->over,turn:state->turn';
    const [fr, games, inv] = await Promise.all([
      sb.from('friendships').select('requester,addressee,status'),
      sb.from('games').select(cols).or('p1.eq.' + me + ',p2.eq.' + me).order('updated_at', { ascending: false }).limit(20),
      sb.from('games').select(cols).eq('invitee', me).is('p2', null).eq('status', 'waiting').order('updated_at', { ascending: false }).limit(20)
    ]);
    if (O.myId !== me || seq !== O.homeSeq) return;
    const err = fr.error || games.error || inv.error;
    if (err) { O.homeMsg = 'Не удалось загрузить данные: ' + errText(err); render(); return; }
    O.friends = (fr.data || []).map((r) => {
      const other = r.requester === me ? r.addressee : r.requester;
      return { id: other, status: r.status === 'accepted' ? 'friend' : r.requester === me ? 'out' : 'in' };
    });
    O.games = games.data || [];
    O.invites = inv.data || [];
    const ids = O.friends.map((f) => f.id);
    O.games.concat(O.invites).forEach((g) => { ids.push(g.p1, g.p2, g.invitee); });
    await fetchNames(ids.concat([me]));
    render();
  }

  async function addFriend(nick) {
    O.friendMsg = ''; O.friendErr = false;
    if (!nick) return;
    const { data, error } = await sb.rpc('send_friend_request', { nick });
    if (error) { O.friendErr = true; O.friendMsg = errText(error); render(); return; }
    O.friendMsg = {
      sent: 'Заявка отправлена. Игрок появится в друзьях, когда примет её.',
      accepted: 'Вы теперь друзья.',
      already: 'Вы уже друзья.',
      pending: 'Заявка уже отправлена, ждём ответа.'
    }[data] || 'Готово.';
    $('friendNick').value = '';
    refreshHome();
    render();
  }
  async function respondFriend(id, accept) {
    const { error } = await sb.rpc('respond_friend_request', { other: id, accept });
    if (error) { O.homeMsg = errText(error); render(); return; }
    refreshHome();
  }
  async function removeFriend(id) {
    if (O.confirmRemove !== id) {
      O.confirmRemove = id; render();
      setTimeout(() => { if (O.confirmRemove === id) { O.confirmRemove = null; render(); } }, 4000);
      return;
    }
    O.confirmRemove = null;
    const { error } = await sb.rpc('remove_friend', { other: id });
    if (error) { O.homeMsg = errText(error); render(); return; }
    refreshHome();
  }
  let suggestTimer = null;
  function suggestNicks(q) {
    clearTimeout(suggestTimer);
    const list = $('nickSuggest');
    if (!sb || !q || q.length < 2) { list.innerHTML = ''; return; }
    suggestTimer = setTimeout(async () => {
      const safe = q.replace(/[%_\\]/g, '');
      const { data } = await sb.from('profiles').select('id,nickname').ilike('nickname', safe + '%').neq('id', O.myId).limit(6);
      list.innerHTML = '';
      (data || []).forEach((r) => { const o = document.createElement('option'); o.value = r.nickname; list.appendChild(o); });
    }, 250);
  }

  async function createGame(inviteeId) {
    if (!sb || O.creating) return;
    O.creating = true; O.homeMsg = ''; render();
    const cfg = pickCfg(S);
    const st = E.make(cfg, 1, 1);
    const mine = { color: S.look[1].color, shape: S.look[1].shape };
    const other = { color: S.look[2].color !== mine.color ? S.look[2].color : otherFreeColor(mine.color), shape: S.look[2].shape };
    for (let t = 0; t < 5; t++) {
      const code = genCode();
      const row = { code, p1: O.myId, status: 'waiting', cfg, looks: { 1: mine, 2: other }, state: st, score: { 1: 0, 2: 0, d: 0 } };
      if (inviteeId) row.invitee = inviteeId;
      const { error } = await sb.from('games').insert(row);
      if (!error) { O.creating = false; openGame(code, false); return; }
      if (error.code !== '23505') { O.creating = false; O.homeMsg = 'Не удалось создать партию: ' + errText(error); render(); return; }
    }
    O.creating = false; O.homeMsg = 'Не удалось создать партию, попробуйте ещё раз.'; render();
  }
  async function declineInvite(code) {
    const { error } = await sb.rpc('decline_game', { g: code });
    if (error) { O.homeMsg = errText(error); render(); return; }
    refreshHome();
  }
  async function deleteGame(code) {
    const { error } = await sb.from('games').delete().eq('code', code);
    if (error) { O.homeMsg = O.msg = 'Не удалось удалить партию: ' + errText(error); render(); return; }
    if (O.code === code) { go('online'); return; }
    refreshHome();
    render();
  }

  // ---------- Online: one game ----------
  function closeGame() {
    if (O.chan && sb) sb.removeChannel(O.chan);
    if (O.poll) clearInterval(O.poll);
    O.chan = null; O.poll = null; O.live = false;
    O.code = null; O.game = null; O.st = null; O.moves = { 1: null, 2: null };
    O.notFound = false; O.msg = '';
    setUrlCode(null);
  }

  async function openGame(code, joinIntent) {
    if (!sb || !O.myId) { setPending(code); render(); return; }
    closeGame();
    O.code = code;
    O.revealing = ''; O.resolving = ''; O.committing = false;
    O.plain = loadPlain(code);
    resetUi();
    setUrlCode(code);
    R.route = 'game';
    syncHash();
    render();
    O.chan = sb.channel('game-' + code)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'code=eq.' + code }, () => scheduleFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moves', filter: 'game_code=eq.' + code }, () => scheduleFetch())
      .subscribe((status) => { O.live = status === 'SUBSCRIBED'; render(); if (O.live) scheduleFetch(); });
    // Backup polling keeps the game going even if the live connection is blocked or drops.
    O.poll = setInterval(() => {
      if (!O.code) return;
      const gap = Date.now() - O.lastFetch;
      if ((!O.live && gap > 3000) || gap > 15000) fetchGame();
    }, 1500);
    await fetchGame();
    if (O.code !== code) return;
    const g = O.game;
    if (joinIntent && g && !g.p2 && g.p1 !== O.myId && g.status === 'waiting') joinGame();
  }

  let fetchTimer = null;
  function scheduleFetch() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchGame, 120);
  }

  async function fetchGame() {
    const code = O.code;
    if (!sb || !code) return;
    const seq = ++O.fetchSeq;
    const [g, m] = await Promise.all([
      sb.from('games').select('*').eq('code', code).maybeSingle(),
      sb.from('moves').select('seat,game_no,round,commit,reveal').eq('game_code', code)
    ]);
    if (O.code !== code || seq !== O.fetchSeq) return;
    O.lastFetch = Date.now();
    if (g.error) { gameErr(g.error, 'Не удалось загрузить партию'); return; }
    if (!g.data) { O.notFound = true; O.game = null; O.st = null; render(); return; }
    O.notFound = false;
    O.game = g.data;
    O.st = g.data.state;
    const mv = { 1: null, 2: null };
    (m.data || []).forEach((r) => { mv[r.seat] = { gameNo: r.game_no, round: r.round, commit: r.commit, reveal: r.reveal }; });
    O.moves = mv;
    if (O.st) {
      const key = O.st.gameNo + ':' + O.st.round;
      if (O.revealing && O.revealing !== key) O.revealing = '';
    }
    const ids = [g.data.p1, g.data.p2, g.data.invitee].filter((x) => x && !O.names[x]);
    if (ids.length) fetchNames(ids);
    render();
    tick();
  }

  async function joinGame() {
    O.joining = true; O.msg = ''; render();
    const hostColor = O.game && O.game.looks && O.game.looks[1] ? O.game.looks[1].color : 'cobalt';
    const mine = { color: S.look[1].color, shape: S.look[1].shape };
    if (mine.color === hostColor) mine.color = otherFreeColor(hostColor);
    const { data, error } = await sb.rpc('join_game', { g: O.code, my_look: mine });
    O.joining = false;
    if (gameErr(error, 'Не удалось сесть за стол')) return;
    if (!data) O.msg = 'Сесть за этот стол не получилось: место уже занято или приглашение было не вам.';
    await fetchGame();
    render();
  }

  async function commitMove(m) {
    const st = O.st, me = mySeat(), code = O.code;
    if (!st || !me) return;
    const pl = { gameNo: st.gameNo, round: st.round, i: m.i, kind: m.kind, anchor: !!m.anchor, salt: randSalt() };
    O.plain = pl;
    savePlain(code, pl);
    O.committing = true; O.msg = ''; render();
    const commit = await hashPlain(pl);
    const { error } = await sb.from('moves').upsert(
      { game_code: code, seat: me, game_no: pl.gameNo, round: pl.round, commit, reveal: null },
      { onConflict: 'game_code,seat' }
    );
    O.committing = false;
    if (gameErr(error, 'Ход не отправился')) return;
    fetchGame();
  }

  async function tick() {
    const g = O.game, st = O.st, me = mySeat(), code = O.code;
    if (!g || !st || !me || st.over || !g.cfg.secret || !g.p2) return;
    const op = 3 - me, key = st.gameNo + ':' + st.round;
    const a = O.moves[me], b = O.moves[op];
    if (moveCurrent(a, st) && moveCurrent(b, st) && !a.reveal && O.revealing !== key && hasPlain(st)) {
      O.revealing = key;
      const pl = O.plain;
      const { error } = await sb.from('moves')
        .update({ reveal: { i: pl.i, kind: pl.kind, anchor: pl.anchor, salt: pl.salt } })
        .eq('game_code', code).eq('seat', me).eq('game_no', pl.gameNo).eq('round', pl.round);
      if (error) { O.revealing = ''; gameErr(error, 'Не удалось открыть ход'); return; }
      fetchGame();
      return;
    }
    if (moveCurrent(a, st) && moveCurrent(b, st) && a.reveal && b.reveal && O.resolving !== key) {
      O.resolving = key;
      const mv = {};
      for (const s of [1, 2]) {
        const d = O.moves[s], r = d.reveal || {};
        const pl = { gameNo: d.gameNo, round: d.round, i: r.i, kind: r.kind, anchor: !!r.anchor, salt: r.salt };
        const ok = (await hashPlain(pl)) === d.commit;
        let m = { i: pl.i, kind: pl.kind, anchor: pl.anchor };
        if (!ok || !E.validTarget(st, g.cfg, s, m.i, m.kind) || (m.kind === 'shot' && st.shots[s] <= 0)) m = { kind: 'pass' };
        mv[s] = m;
      }
      if (O.code !== code || !O.st || O.st.gameNo !== st.gameNo || O.st.round !== st.round || O.st.over) return;
      const st2 = clone(st);
      E.resolveRound(st2, g.cfg, mv[1], mv[2]);
      const upd = { state: st2 };
      if (st2.over) { const sc = Object.assign({ 1: 0, 2: 0, d: 0 }, g.score); bumpScore(sc, st2); upd.score = sc; }
      // Both players may resolve the same round; the filter makes only the first write land.
      const { error } = await sb.from('games').update(upd)
        .eq('code', code).eq('state->>gameNo', String(st.gameNo)).eq('state->>round', String(st.round));
      if (error) { O.resolving = ''; gameErr(error, 'Не удалось открыть ходы'); return; }
      fetchGame();
    }
  }

  async function onlineSeq(m) {
    const g = O.game, me = mySeat(), code = O.code;
    if (!g || !O.st || !me) return;
    const st = O.st, st2 = clone(st);
    E.resolveSeq(st2, g.cfg, me, m);
    const upd = { state: st2 };
    if (st2.over) { const sc = Object.assign({ 1: 0, 2: 0, d: 0 }, g.score); bumpScore(sc, st2); upd.score = sc; }
    O.committing = true; O.msg = ''; render();
    const { error } = await sb.from('games').update(upd)
      .eq('code', code).eq('state->>gameNo', String(st.gameNo)).eq('state->>moves', String(st.moves));
    O.committing = false;
    if (gameErr(error, 'Ход не отправился')) return;
    fetchGame();
  }

  async function onlineRematch() {
    const g = O.game, st = O.st, code = O.code;
    if (!g || !st) return;
    const st2 = E.make(g.cfg, 3 - st.starter, st.gameNo + 1);
    const { error } = await sb.from('games').update({ state: st2 })
      .eq('code', code).eq('state->>gameNo', String(st.gameNo));
    if (gameErr(error, 'Не удалось начать новую партию')) return;
    fetchGame();
  }

  async function saveMyLook(cur) {
    const me = mySeat(), code = O.code;
    if (!O.game || !me) return;
    const looks = Object.assign({}, O.game.looks, { [me]: cur });
    O.game = Object.assign({}, O.game, { looks });
    render();
    const { error } = await sb.from('games').update({ looks }).eq('code', code);
    if (gameErr(error, 'Не удалось сохранить вид фишек')) return;
    fetchGame();
  }

  function copyLink() {
    if (!O.code) return;
    const link = gameLink(O.code);
    const note = $('gbNote');
    const fallback = () => {
      const f = document.getElementById('linkField');
      if (f) { f.focus(); f.select(); }
      note.hidden = false;
      note.textContent = 'Скопируйте ссылку вручную: ' + link;
    };
    try {
      navigator.clipboard.writeText(link).then(() => {
        note.hidden = false; note.textContent = 'Ссылка скопирована. Отправьте её сопернику.';
        const cn = document.getElementById('copyNote'); if (cn) cn.textContent = 'Ссылка скопирована.';
      }, fallback);
    } catch (e) { fallback(); }
  }
  function shareLink() {
    if (!O.code || !navigator.share) return copyLink();
    navigator.share({ title: 'Призрачная пятёрка', text: 'Сыграем? Код партии ' + O.code, url: gameLink(O.code) }).catch(() => {});
  }

  // ---------- Rendering: game ----------
  let builtN = 0, cellEls = [], cellKeys = [];
  let fxKey = '', fxDone = '';
  function ensureBoard(n) {
    if (builtN === n) return;
    builtN = n;
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    cellEls = []; cellKeys = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cell empty'; b.dataset.i = i;
      b.setAttribute('role', 'gridcell');
      frag.appendChild(b); cellEls.push(b); cellKeys.push('');
    }
    boardEl.appendChild(frag);
  }
  function applyLook() {
    const root = document.documentElement.style;
    root.setProperty('--p1', 'var(--c-' + lookOf(1).color + ')');
    root.setProperty('--p2', 'var(--c-' + lookOf(2).color + ')');
    $('ico1').className = 'stone p1 sh-' + lookOf(1).shape;
    $('ico2').className = 'stone p2 sh-' + lookOf(2).shape;
  }
  function cellLabel(st, i, v) {
    const n = st.n, r = ((i / n) | 0) + 1, c = (i % n) + 1;
    const what = v === 1 || v === 2 ? 'фишка, ' + colorOf(v).nom : v === 3 ? 'стена' : 'пусто';
    return 'Строка ' + r + ', столбец ' + c + ': ' + what;
  }

  function renderBoard(st, cfg, p, human) {
    ensureBoard(st.n);
    const n = st.n, L = cfg.mem;
    const k = st.gameNo + ':' + st.round + ':' + st.moves + ':' + st.log.length;
    if (k !== fxKey) { fxKey = k; setTimeout(() => { fxDone = k; render(); }, 750); }
    const none = { fresh: [], gone: [], burn: -1 };
    const fx = fxDone === fxKey ? none : (st.fx || none);
    const life = new Map();
    if (L) for (const pl of [1, 2]) st.q[pl].forEach((idx, j) => life.set(idx, L - st.q[pl].length + j + 1));
    const walls = new Map(st.walls);
    const anchors = new Set(st.anchors);
    const winSet = new Set(st.winLine);
    const fresh = new Set(fx.fresh);
    const sh = (pl) => ' sh-' + lookOf(pl).shape;
    boardEl.classList.toggle('live', human);
    for (let i = 0; i < n * n; i++) {
      const v = st.cells[i];
      let cls = 'cell', inner = '';
      if (human && E.validTarget(st, cfg, p, i, ui.action)) cls += ' ok';
      if (v === 3) {
        cls += ' wall' + (fx.burn === i ? ' burn' : '');
        const ttl = walls.get(i);
        if (cfg.wallTtl && ttl) {
          if (ttl <= 3) inner = '<span class="badge">' + ttl + '</span>';
          if (ttl === 1) cls += ' cool';
        }
      } else if (v === 1 || v === 2) {
        const anchored = anchors.has(i);
        const l = anchored ? 0 : life.get(i);
        let sc = 'stone p' + v + sh(v);
        if (fresh.has(i)) sc += ' pop';
        if (l === 1) { sc += ' fragile'; cls += ' frag'; } else if (l === 2) sc += ' worn';
        inner = '<span class="' + sc + '"></span>';
        if (anchored) inner += '<span class="badge">∞</span>';
        else if (l && l <= 3) inner += '<span class="badge">' + l + '</span>';
        if (winSet.has(i)) cls += ' win-p' + v;
        if (st.last.includes(i)) cls += ' last';
      } else {
        cls += ' empty';
        const van = fx.gone.find((x) => x[0] === i);
        if (van) inner = '<span class="stone p' + van[1] + sh(van[1]) + ' vanish"></span>';
        else if (ui.sel === i && p && ui.action === 'place') {
          cls += ' selected';
          inner = '<span class="stone p' + p + sh(p) + ' ghost"></span>' + (ui.useAnchor ? '<span class="badge">∞</span>' : '');
        }
      }
      if (ui.sel === i && ui.action === 'shot') inner += '<span class="aim"></span>';
      const key = cls + '|' + inner;
      if (cellKeys[i] !== key) {
        const el = cellEls[i];
        el.className = cls; el.innerHTML = inner;
        el.setAttribute('aria-label', cellLabel(st, i, v));
        cellKeys[i] = key;
      }
    }
  }

  function statusText(st, cfg) {
    const pickHint = 'Нажмите на клетку ещё раз или «' + (ui.action === 'shot' ? 'Выстрелить' : 'Сделать ход') + '».';
    const shotHint = cfg.secret ? 'Выберите цель: фишку соперника или пустую клетку, куда он может сходить.' : 'Выберите фишку соперника.';
    if (st.over) return resultText(st.winner, st.winReason);
    if (online()) {
      const g = O.game, me = mySeat();
      if (!g.p2) {
        if (g.status === 'declined') return nameOf(g.invitee) + ' отказывается от партии.';
        if (g.invitee) return me === 1 ? 'Ждём, когда ' + nameOf(g.invitee) + ' примет приглашение.' : 'Вас пригласили в эту партию.';
        return me === 1 ? 'Ждём соперника. Отправьте ему код или ссылку.' : (O.joining ? 'Садимся за стол…' : 'Партия ждёт второго игрока.');
      }
      if (!me) return 'Это чужая партия.';
      if (O.committing) return 'Отправляем ход…';
      if (cfg.secret) {
        const theirs = moveCurrent(O.moves[3 - me], st);
        if (seatDone(me)) return theirs ? 'Открываем ходы…' : 'Ваш ход принят и спрятан. Ждём соперника.';
        if (ui.sel !== null) return pickHint;
        if (ui.action === 'shot') return shotHint;
        if (moveCurrent(O.moves[me], st)) return 'Ход потерялся после перезагрузки. Выберите его заново.';
        return theirs ? 'Соперник уже сходил. Ваш ход.' : 'Выберите клетку. Соперник ходит одновременно с вами.';
      }
      if (st.turn !== me) return 'Ход соперника.';
      if (ui.sel !== null) return pickHint;
      if (ui.action === 'shot') return shotHint;
      return 'Ваш ход.';
    }
    if (busy) return 'Бот думает…';
    if (cfg.secret && Lc.phase === 'handoff') return 'Ход Игрока 1 спрятан.';
    if (ui.sel !== null) return pickHint;
    if (ui.action === 'shot') return shotHint;
    if (cfg.secret) {
      if (Lc.phase === 'pick1') return S.opp === 'bot' ? 'Выберите клетку. Бот ходит одновременно и не видит ваш выбор.' : 'Игрок 1 выбирает ход. Игрок 2, не смотрите.';
      return 'Игрок 2 выбирает ход. Игрок 1, не смотрите.';
    }
    return S.opp === 'bot' ? 'Ваш ход.' : 'Ход: ' + names()[st.turn] + '.';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderCover() {
    let html = '';
    const g = O.game, me = mySeat();
    if (!online() && Lc.cfg && Lc.cfg.secret && Lc.phase === 'handoff') {
      html = '<h2>Ход Игрока 1 спрятан</h2><p>Передайте устройство Игроку 2. Он выберет ход, не зная, что сделал первый.</p>' +
        '<button class="btn primary" type="button" data-act="reveal">Я Игрок 2, показать поле</button>';
    } else if (online() && g && !g.p2 && me === 1 && g.status === 'declined') {
      html = '<h2>' + esc(nameOf(g.invitee)) + ' отказывается</h2><p>Можно удалить эту партию и позвать кого-нибудь ещё.</p>' +
        '<button class="btn primary" type="button" data-act="delete-game">Удалить партию</button>';
    } else if (online() && g && !g.p2 && me === 1 && g.invitee) {
      html = '<h2>Ждём ' + esc(nameOf(g.invitee)) + '</h2><p>Приглашение появилось у друга в разделе «Приглашения». Партия начнётся, как только он его примет.</p>' +
        '<button class="btn ghost" type="button" data-act="delete-game">Отменить партию</button>';
    } else if (online() && g && !g.p2 && me === 1) {
      html = '<h2>Ждём соперника</h2><p>Отправьте код или ссылку. Соперник войдёт в свой аккаунт и сразу сядет за стол.</p>' +
        '<div class="bigcode">' + esc(O.code) + '</div>' +
        '<div class="linkrow"><input id="linkField" readonly value="' + esc(gameLink(O.code)) + '" aria-label="Ссылка на партию">' +
        '<button class="btn primary" type="button" data-act="' + (navigator.share ? 'share' : 'copy') + '">' + (navigator.share ? 'Отправить' : 'Скопировать') + '</button></div>' +
        '<p class="small" id="copyNote"></p>' +
        '<button class="linkbtn" type="button" data-act="delete-game">Отменить партию</button>';
    }
    const cover = $('cover');
    cover.hidden = !html;
    if (cover.dataset.html !== html) { cover.dataset.html = html; cover.firstElementChild.innerHTML = html; }
  }

  // ---------- Rendering: account and home ----------
  const AUTH_TITLES = { login: 'Вход', signup: 'Регистрация', confirm: 'Подтвердите email', forgot: 'Восстановление пароля', reset: 'Новый пароль' };
  function setNote(el, text, isErr) {
    el.textContent = text || '';
    el.hidden = !text;
    el.style.color = isErr ? '' : 'var(--muted)';
  }
  function renderAuth() {
    let view = O.authView;
    if (O.recovery) view = 'reset';
    const simple = view === 'login' || view === 'signup';
    $('authSwitch').hidden = !simple || !sb;
    $('authSwitch').querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.auth === view ? 'true' : 'false');
    });
    $('authTitle').hidden = simple;
    $('authTitle').textContent = AUTH_TITLES[view] || 'Вход';
    let note = O.authMsg, noteErr = O.authErr;
    if (!configured) { note = 'Онлайн-режим ещё не настроен: впишите адрес проекта и ключ Supabase в файл config.js (см. README).'; noteErr = true; }
    else if (!sb) { note = 'Не загрузилась библиотека Supabase. Проверьте, что папка vendor лежит рядом с index.html.'; noteErr = true; }
    else if (!note && pendingCode && view === 'login') note = 'Войдите или зарегистрируйтесь, чтобы открыть партию ' + pendingCode + '.';
    setNote($('authNote'), note, noteErr);
    // Без сервера остаётся только игра с ботом: иначе страница превратилась бы в тупик.
    $('guestRow').hidden = !!sb;
    document.querySelectorAll('#screenAuth .authform').forEach((f) => {
      f.hidden = !sb || !O.authReady || f.dataset.view !== view;
      f.querySelectorAll('button[type="submit"]').forEach((b) => { b.disabled = O.authBusy; });
    });
    $('confirmText').textContent = 'Мы отправили письмо на ' + (O.authEmail || 'вашу почту') + '. Введите код из него или просто нажмите ссылку в письме. Письмо может идти пару минут, загляните и в «Спам».';
    $('resetCodeField').hidden = O.recovery;
    $('resetBack').hidden = O.recovery;
    $('resetText').textContent = O.recovery ? 'Придумайте новый пароль.' : 'Мы отправили код на ' + (O.authEmail || 'вашу почту') + '. Введите его и новый пароль.';
  }

  function li(cls) { const el = document.createElement('li'); if (cls) el.className = cls; return el; }
  function info(title, sub) {
    const d = document.createElement('div'); d.className = 'gi';
    const b = document.createElement('b'); b.textContent = title;
    const s = document.createElement('span'); s.textContent = sub;
    d.append(b, s);
    return d;
  }
  function btn(text, attrs, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (cls ? ' ' + cls : ''); b.textContent = text;
    Object.entries(attrs).forEach(([k, v]) => { b.dataset[k] = v; });
    return b;
  }
  function btns(...items) { const d = document.createElement('div'); d.className = 'btns'; d.append(...items); return d; }
  function emptyLine(ul, text) { const p = document.createElement('p'); p.className = 'empty-list'; p.textContent = text; ul.appendChild(p); }

  function gameState(g) {
    const me = O.myId, host = g.p1 === me;
    const opp = host ? (g.p2 || g.invitee) : g.p1;
    const withWho = opp ? 'с ' + nameOf(opp) : '';
    if (!g.p2) {
      if (g.status === 'declined') return nameOf(g.invitee) + ' отказывается';
      if (g.invitee) return host ? 'ждём ответа ' + withWho.replace('с ', 'от ') : 'вас пригласили';
      return 'ждём соперника по ссылке';
    }
    if (g.over) return 'окончена · ' + withWho;
    if (g.cfg && !g.cfg.secret) {
      const seat = host ? 1 : 2;
      return (g.turn === seat ? 'ваш ход' : 'ход соперника') + ' · ' + withWho;
    }
    return 'идёт · ' + withWho;
  }

  function renderHome() {
    setNote($('homeNote'), O.homeMsg, !/изменён/.test(O.homeMsg));

    // Invites: incoming friend requests and game invitations.
    const inv = $('invites');
    inv.innerHTML = '';
    const incoming = O.friends.filter((f) => f.status === 'in');
    for (const f of incoming) {
      const row = li('invite');
      row.append(info(nameOf(f.id), 'хочет добавить вас в друзья'),
        btns(btn('Принять', { act: 'fr-accept', id: f.id }, 'go'), btn('Отклонить', { act: 'fr-decline', id: f.id })));
      inv.appendChild(row);
    }
    for (const g of O.invites) {
      const row = li('invite');
      row.append(info(nameOf(g.p1) + ' зовёт сыграть', cfgSummary(g.cfg)),
        btns(btn('Играть', { act: 'inv-accept', code: g.code }, 'go'), btn('Отказаться', { act: 'inv-decline', code: g.code })));
      inv.appendChild(row);
    }
    $('invitesSec').hidden = !incoming.length && !O.invites.length;

    // My games.
    const gl = $('myGames');
    gl.innerHTML = '';
    if (!O.games.length) emptyLine(gl, 'Пока нет партий.');
    for (const g of O.games) {
      const row = li();
      const host = g.p1 === O.myId;
      const actions = [btn('Открыть', { act: 'open-game', code: g.code })];
      if (host && (!g.p2 || g.over)) actions.push(btn('Удалить', { act: 'delete-game', code: g.code }, 'warn'));
      row.append(info(gameState(g), g.code + ' · ' + cfgSummary(g.cfg)), btns(...actions));
      gl.appendChild(row);
    }
    $('linkGame').disabled = O.creating;

    // Friends.
    const fm = $('friendMsg');
    fm.textContent = O.friendMsg;
    fm.className = 'small' + (O.friendMsg ? (O.friendErr ? ' err' : ' ok') : '');
    const fl = $('friends');
    fl.innerHTML = '';
    const list = O.friends.filter((f) => f.status !== 'in')
      .sort((a, b) => (a.status === b.status ? nameOf(a.id).localeCompare(nameOf(b.id), 'ru') : a.status === 'friend' ? -1 : 1));
    if (!list.length) emptyLine(fl, 'Друзей пока нет. Добавьте друга по нику: он увидит заявку у себя.');
    for (const f of list) {
      const row = li();
      const confirming = O.confirmRemove === f.id;
      if (f.status === 'friend') {
        row.append(info(nameOf(f.id), 'в друзьях'),
          btns(btn('Играть', { act: 'invite', id: f.id }, 'go'), btn(confirming ? 'Точно удалить?' : 'Удалить', { act: 'fr-remove', id: f.id }, 'warn')));
      } else {
        row.append(info(nameOf(f.id), 'заявка отправлена, ждём ответа'),
          btns(btn(confirming ? 'Точно отменить?' : 'Отменить', { act: 'fr-remove', id: f.id }, 'warn')));
      }
      fl.appendChild(row);
    }
  }

  function renderProfile() {
    const forced = !O.profile || !NICK_RE.test(O.profile.nickname);
    let note = O.profileMsg, isErr = O.profileErr;
    if (forced && !note) { note = O.profile ? 'Ник «' + O.profile.nickname + '» не подходит под новые правила. Придумайте новый.' : 'Придумайте ник: по нему вас найдут друзья.'; isErr = false; }
    setNote($('profileNote'), note, isErr);
    $('meEmail').textContent = O.email;
    $('passCard').hidden = forced;
    $('nickBtn').disabled = O.authBusy;
    if (document.activeElement !== $('nickIn') && !$('nickIn').dataset.touched) {
      $('nickIn').value = O.profile ? O.profile.nickname : (O.email.split('@')[0] || '').replace(/[^A-Za-zА-Яа-яЁё0-9_.-]/g, '').slice(0, 20);
    }
  }

  // ---------- Rendering: page ----------
  function applyTheme() {
    const el = document.documentElement;
    if (S.theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', S.theme);
  }

  // Куда игрока пускать: без входа — только на страницу входа, без ника — только в профиль.
  function routeGuard() {
    if (!signedIn()) { R.route = 'auth'; return; }
    if (R.route === 'auth') R.route = 'play';
    if (R.route === 'game' && !O.code) R.route = 'online';
    if (!O.myId && R.route !== 'play' && R.route !== 'look') R.route = 'play';
    if (O.myId && O.profile !== undefined && (!O.profile || !NICK_RE.test(O.profile.nickname))) R.route = 'profile';
  }

  function renderNav(route) {
    const tab = route === 'game' ? 'online' : route;
    $('appbar').hidden = route === 'auth';
    document.querySelectorAll('#tabs .tab').forEach((b) => {
      const nav = b.dataset.nav;
      b.hidden = !O.myId && (nav === 'online' || nav === 'profile');
      if (nav === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const waiting = O.friends.filter((f) => f.status === 'in').length + O.invites.length;
    const count = $('navCount');
    count.hidden = !waiting;
    count.textContent = waiting || '';
    $('meNickTop').textContent = O.profile ? O.profile.nickname : O.guest ? 'Гость' : '';
  }

  // Правила партии нужны и на экране игры, и в лобби: карточка одна и переезжает.
  function placeRules(route) {
    const card = $('rulesCard');
    const slot = $(route === 'online' ? 'rulesSlotOnline' : 'rulesSlotPlay');
    if (card.parentElement !== slot) slot.appendChild(card);
    $('rulesTitle').textContent = route === 'online' ? 'Правила новой партии' : 'Правила партии';
  }

  function render() {
    applyTheme();
    applyLook();
    routeGuard();
    const route = R.route;
    $('screenAuth').hidden = route !== 'auth';
    $('screenPlay').hidden = !(route === 'play' || route === 'game');
    $('screenOnline').hidden = route !== 'online';
    $('screenLook').hidden = route !== 'look';
    $('screenProfile').hidden = route !== 'profile';
    renderNav(route);
    placeRules(route);
    if (route === 'auth') { renderAuth(); return; }
    renderSettings();
    renderLooks();
    if (route === 'online') { renderHome(); return; }
    if (route === 'profile') { renderProfile(); return; }
    if (route === 'look') return;
    renderPlay();
  }

  function renderPlay() {
    const isOnline = online();
    $('localBar').hidden = isOnline;
    $('onlineBar').hidden = !isOnline;
    if (isOnline) {
      $('gbCode').textContent = O.code || '';
      $('liveDot').classList.toggle('on', O.live);
      $('liveDot').title = O.live ? 'Связь в реальном времени' : 'Обновляем раз в несколько секунд';
      const byLink = !!(O.game && !O.game.invitee);
      $('shareBtn').hidden = !navigator.share || !byLink;
      $('copyBtn').hidden = !byLink;
    }
    const st = curSt(), cfg = curCfg();
    $('boardWrap').hidden = !st;
    $('actions').hidden = !st;
    $('players').hidden = !st;
    $('draws').hidden = !st;
    $('logPanel').hidden = !st;
    $('tools').hidden = true;
    const msg = $('msg');
    msg.textContent = isOnline ? O.msg : '';
    msg.hidden = !msg.textContent;
    if (!st) {
      $('round').textContent = 'Партия';
      $('statusText').className = '';
      $('statusText').textContent = O.notFound
        ? 'Партия ' + O.code + ' не найдена. Возможно, её удалили или у вас нет к ней доступа.'
        : 'Загружаем партию…';
      return;
    }

    const p = picker();
    const human = !!p && isHuman(p) && !busy;
    renderBoard(st, cfg, p, human);
    renderCover();

    $('round').textContent = cfg.secret ? 'Раунд ' + st.round : 'Ход ' + (st.moves + (st.over ? 0 : 1));
    const stEl = $('statusText');
    stEl.className = st.over && st.winner ? 'win' + st.winner : '';
    stEl.textContent = statusText(st, cfg);

    const showShot = cfg.shots > 0, showAnchor = E.anchorOn(cfg);
    $('tools').hidden = !(human && !st.over && (showShot || showAnchor));
    if (human) {
      $('actPlace').hidden = !showShot;
      $('actShot').hidden = !showShot;
      $('actPlace').setAttribute('aria-pressed', ui.action === 'place' ? 'true' : 'false');
      $('actShot').setAttribute('aria-pressed', ui.action === 'shot' ? 'true' : 'false');
      $('actShot').textContent = 'Выстрел · ' + st.shots[p];
      $('actShot').disabled = !E.canShoot(st, cfg, p);
      $('anchorBtn').hidden = !showAnchor;
      $('anchorBtn').textContent = 'Якорь · ' + st.anchorLeft[p];
      $('anchorBtn').disabled = st.anchorLeft[p] === 0 || ui.action === 'shot';
      $('anchorBtn').setAttribute('aria-pressed', ui.useAnchor ? 'true' : 'false');
    }

    const cbtn = $('confirm');
    if (st.over) {
      cbtn.textContent = 'Ещё партия';
      cbtn.disabled = isOnline && !mySeat();
    } else {
      cbtn.textContent = ui.action === 'shot' ? 'Выстрелить' : 'Сделать ход';
      cbtn.disabled = !(ui.sel !== null && human);
    }
    $('newGame').hidden = st.over;

    const nm = names();
    const score = isOnline ? Object.assign({ 1: 0, 2: 0, d: 0 }, O.game.score) : Lc.score;
    for (const pl of [1, 2]) {
      $('name' + pl).textContent = nm[pl];
      const count = st.q[pl].length + st.anchors.filter((i) => st.cells[i] === pl).length;
      $('meta' + pl).textContent = colorOf(pl).nom + ' · на поле ' + count + (cfg.mem ? ' / ' + cfg.mem : '');
      const extra = [];
      if (cfg.shots) extra.push('выстрелы ' + st.shots[pl]);
      if (E.anchorOn(cfg)) extra.push('якорь ' + st.anchorLeft[pl]);
      if (cfg.capture) extra.push('пары ' + st.caps[pl] + '/5');
      if (isOnline && cfg.secret && !st.over && O.game.p2 && seatDone(pl)) extra.push('ход сделан');
      $('extra' + pl).textContent = extra.join(' · ');
      $('extra' + pl).hidden = !extra.length;
      $('wins' + pl).textContent = score[pl];
      let active;
      if (st.over) active = st.winner === pl;
      else if (isOnline) active = !!O.game.p2 && (cfg.secret ? !seatDone(pl) : st.turn === pl);
      else active = cfg.secret ? Lc.phase === 'pick' + pl : st.turn === pl;
      $('card' + pl).classList.toggle('active', active);
    }
    $('draws').textContent = 'Ничьих: ' + score.d;

    const log = $('log');
    log.innerHTML = '';
    for (const e of st.log) {
      const row = li(e.kind || '');
      const b = document.createElement('b'); b.textContent = e.tag;
      const sp = document.createElement('span'); sp.textContent = e.ev.map(evText).filter(Boolean).join(' ');
      row.append(b, sp);
      log.appendChild(row);
    }
  }

  function renderSettings() {
    const locked = online() && !!O.game;
    const src = locked ? O.game.cfg : S;
    document.querySelectorAll('.seg').forEach((seg) => {
      const key = seg.dataset.key;
      if (!key) return;
      const val = key === 'opp' ? S.opp : key === 'theme' ? S.theme : src[key];
      const cur = typeof val === 'boolean' ? (val ? '1' : '0') : String(val);
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.v === cur ? 'true' : 'false');
        b.disabled = locked && key !== 'opp' && key !== 'theme';
      });
    });
    const dim = (id, off) => {
      const el = $(id);
      el.classList.toggle('dim', off);
      if (off) el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    };
    dim('set-wallTtl', !src.secret || locked);
    dim('set-anchor', !src.mem || locked);
    ['set-size', 'set-secret', 'set-mem', 'set-shots', 'set-capture'].forEach((id) => $(id).classList.toggle('dim', locked));
    $('rulesCard').classList.toggle('locked', locked);
    $('rulesNote').textContent = locked ? cfgSummary(src) + '. Правила выбрал создатель партии.'
      : R.route === 'online' ? 'Эти правила получит партия, которую вы создадите.'
      : 'Смена правил сразу начинает новую партию.';
  }

  function renderLooks() {
    let blocks;
    // Раздел «Вид» открыт поверх партии: там настраиваются фишки этой партии, а не домашние.
    const isOnline = inOnlineGame(), me = mySeat();
    if (!isOnline) {
      const nm = names();
      blocks = [{ p: 1, label: nm[1], look: S.look[1], block: null }, { p: 2, label: nm[2], look: S.look[2], block: null }];
    } else {
      const other = O.game.looks[3 - me];
      blocks = [{ p: me, label: 'Ваши фишки', look: O.game.looks[me] || S.look[1], block: other ? other.color : null }];
    }
    const key = JSON.stringify(blocks) + isOnline;
    const host = $('looks');
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.innerHTML = blocks.map((bk) =>
      '<div class="look" data-p="' + bk.p + '">' +
        '<span class="look-name"></span>' +
        '<div class="swatches" role="group" aria-label="Цвет">' +
          COLORS.map((c) => '<button type="button" class="swatch" data-color="' + c.id + '" style="--sw: var(--c-' + c.id + ')" title="' + c.name + '" aria-label="' + c.name + '" aria-pressed="' + (bk.look.color === c.id) + '"' + (bk.block === c.id ? ' disabled' : '') + '></button>').join('') +
        '</div>' +
        '<div class="shapes" role="group" aria-label="Фигура">' +
          SHAPES.map((s) => '<button type="button" class="shp" data-shape="' + s.id + '" title="' + s.name + '" aria-label="' + s.name + '" aria-pressed="' + (bk.look.shape === s.id) + '"><span class="stone p' + bk.p + ' sh-' + s.id + '"></span></button>').join('') +
        '</div>' +
      '</div>'
    ).join('');
    host.querySelectorAll('.look-name').forEach((el, k) => { el.textContent = blocks[k].label; });
  }

  // ---------- Events ----------
  $('looks').addEventListener('click', (e) => {
    const box = e.target.closest('.look');
    const sw = e.target.closest('.swatch'), shp = e.target.closest('.shp');
    if (!box || (!sw && !shp) || (sw && sw.disabled)) return;
    const p = +box.dataset.p;
    if (!inOnlineGame()) {
      const o = 3 - p;
      if (sw) {
        const c = sw.dataset.color;
        if (S.look[o].color === c) S.look[o].color = S.look[p].color;
        S.look[p].color = c;
      } else S.look[p].shape = shp.dataset.shape;
      save(); render();
      return;
    }
    const me = mySeat();
    const base = O.game.looks[me] || S.look[1];
    const cur = { color: base.color, shape: base.shape };
    if (sw) cur.color = sw.dataset.color; else cur.shape = shp.dataset.shape;
    S.look[1] = { color: cur.color, shape: cur.shape };
    save();
    saveMyLook(cur);
  });

  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const key = seg.dataset.key, type = seg.dataset.type, v = b.dataset.v;
      const val = type === 'bool' ? v === '1' : type === 'num' ? Number(v) : v;
      if (S[key] === val) return;
      S[key] = val;
      save();
      if (key === 'theme') { render(); return; }
      if (key === 'opp') { Lc.score = { 1: 0, 2: 0, d: 0 }; Lc.starter = 2; newLocal(); return; }
      // Правила: на экране игры они перезапускают партию, в лобби — ждут новой.
      if (R.route !== 'play') { render(); return; }
      Lc.starter = 2;
      newLocal();
    });
  });

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { go(nav.dataset.nav); return; }
    const authLink = e.target.closest('[data-auth]');
    if (authLink) {
      const to = authLink.dataset.auth;
      if (to === 'resend') { doResend(); return; }
      O.authView = to; O.authMsg = ''; O.authErr = false;
      const email = $('loginEmail').value || $('signEmail').value || $('forgotEmail').value;
      if (email) { $('loginEmail').value = $('loginEmail').value || email; $('forgotEmail').value = $('forgotEmail').value || email; }
      render();
      return;
    }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'copy') copyLink();
    else if (act === 'share') shareLink();
    else if (act === 'reveal' && Lc.phase === 'handoff') { Lc.phase = 'pick2'; render(); }
    else if (act === 'guest') { O.guest = true; go('play'); }
    else if (act === 'signout') {
      if (sb && O.myId) sb.auth.signOut();
      else { O.guest = false; go('auth'); }
    }
    else if (act === 'fr-accept') respondFriend(t.dataset.id, true);
    else if (act === 'fr-decline') respondFriend(t.dataset.id, false);
    else if (act === 'fr-remove') removeFriend(t.dataset.id);
    else if (act === 'invite') createGame(t.dataset.id);
    else if (act === 'inv-accept') openGame(t.dataset.code, true);
    else if (act === 'inv-decline') declineInvite(t.dataset.code);
    else if (act === 'open-game') openGame(t.dataset.code, false);
    else if (act === 'delete-game') deleteGame(t.dataset.code || O.code);
  });

  window.addEventListener('hashchange', () => {
    const r = routeFromHash();
    if (r && r !== R.route && signedIn()) go(r);
  });

  $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); doLogin($('loginEmail').value.trim(), $('loginPass').value); });
  $('signupForm').addEventListener('submit', (e) => { e.preventDefault(); doSignup($('signNick').value.trim(), $('signEmail').value.trim(), $('signPass').value); });
  $('confirmForm').addEventListener('submit', (e) => { e.preventDefault(); doConfirm($('confirmCode').value.replace(/\s/g, '')); });
  $('forgotForm').addEventListener('submit', (e) => { e.preventDefault(); doForgot($('forgotEmail').value.trim()); });
  $('resetForm').addEventListener('submit', (e) => { e.preventDefault(); doReset($('resetCode').value.replace(/\s/g, ''), $('resetPass').value); });
  $('nickForm').addEventListener('submit', (e) => { e.preventDefault(); saveNick($('nickIn').value.trim()); });
  $('nickIn').addEventListener('input', () => { $('nickIn').dataset.touched = '1'; });
  $('passForm').addEventListener('submit', (e) => { e.preventDefault(); changePass($('newPass').value); });
  let nickCheckTimer = null;
  $('signNick').addEventListener('input', () => {
    const v = $('signNick').value.trim(), hint = $('nickHint');
    clearTimeout(nickCheckTimer);
    hint.className = 'fhint';
    hint.textContent = '3–20 символов: буквы, цифры, точка, дефис, подчёркивание. По нику вас найдут друзья.';
    if (!v) return;
    if (!NICK_RE.test(v)) { hint.className = 'fhint err'; hint.textContent = v.length < 3 ? 'Слишком короткий ник.' : 'Можно только буквы, цифры, точку, дефис и подчёркивание (до 20 символов).'; return; }
    if (!sb) return;
    nickCheckTimer = setTimeout(async () => {
      const { data, error } = await sb.rpc('nickname_available', { n: v });
      if (error || $('signNick').value.trim() !== v) return;
      hint.className = data ? 'fhint' : 'fhint err';
      hint.textContent = data ? 'Ник свободен.' : 'Этот ник уже занят.';
    }, 350);
  });
  $('friendNick').addEventListener('input', () => suggestNicks($('friendNick').value.trim()));
  $('addFriendForm').addEventListener('submit', (e) => { e.preventDefault(); addFriend($('friendNick').value.trim()); });
  $('linkGame').addEventListener('click', () => createGame(null));
  $('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('joinCode').value.trim().toUpperCase();
    if (!CODE_RE.test(code)) { O.homeMsg = 'Код партии состоит из 4–8 латинских букв и цифр.'; render(); return; }
    O.homeMsg = '';
    $('joinCode').value = '';
    openGame(code, true);
  });
  $('toLobby').addEventListener('click', () => go('online'));
  $('confirm').addEventListener('click', confirmMove);
  $('newGame').addEventListener('click', () => { if (!online()) newLocal(); });
  $('actPlace').addEventListener('click', () => setAction('place'));
  $('actShot').addEventListener('click', () => setAction(ui.action === 'shot' ? 'place' : 'shot'));
  $('anchorBtn').addEventListener('click', () => {
    const st = curSt(), p = picker();
    if (!st || !p || !isHuman(p) || st.anchorLeft[p] === 0 || ui.action === 'shot') return;
    ui.useAnchor = !ui.useAnchor;
    render();
  });

  // ---------- Start ----------
  applyTheme();
  Lc.starter = 2;
  Lc.cfg = pickCfg(S);
  Lc.st = E.make(Lc.cfg, 1, 1);
  Lc.phase = Lc.cfg.secret ? 'pick1' : 'pick';
  render();
  initAuth();
})();
