// «Призрачная пятёрка»: интерфейс, локальная игра и игра по сети через Supabase.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { E, botDecide } = window.GhostEngine;
  const boardEl = $('board');

  const COLORS = [
    { id: 'cobalt', name: 'Кобальт', nom: 'кобальтовые', gen: 'кобальтовых' },
    { id: 'indigo', name: 'Индиго', nom: 'индиговые', gen: 'индиговых' },
    { id: 'sky', name: 'Небо', nom: 'небесные', gen: 'небесных' },
    { id: 'teal', name: 'Бирюза', nom: 'бирюзовые', gen: 'бирюзовых' },
    { id: 'emerald', name: 'Изумруд', nom: 'изумрудные', gen: 'изумрудных' },
    { id: 'lime', name: 'Лайм', nom: 'лаймовые', gen: 'лаймовых' },
    { id: 'amber', name: 'Янтарь', nom: 'янтарные', gen: 'янтарных' },
    { id: 'orange', name: 'Мандарин', nom: 'мандариновые', gen: 'мандариновых' },
    { id: 'coral', name: 'Коралл', nom: 'коралловые', gen: 'коралловых' },
    { id: 'crimson', name: 'Вишня', nom: 'вишнёвые', gen: 'вишнёвых' },
    { id: 'rose', name: 'Малина', nom: 'малиновые', gen: 'малиновых' },
    { id: 'plum', name: 'Слива', nom: 'сливовые', gen: 'сливовых' },
    { id: 'violet', name: 'Фиалка', nom: 'фиолетовые', gen: 'фиолетовых' },
    { id: 'lemon', name: 'Лимон', nom: 'лимонные', gen: 'лимонных' },
    { id: 'graphite', name: 'Сталь', nom: 'стальные', gen: 'стальных' },
    { id: 'snow', name: 'Белый', nom: 'белые', gen: 'белых' }
  ];
  // a и b — только для кружка-образца в настройках; сами цвета задаёт styles.css.
  // pair — цвета фишек, которые мы советуем к этой палитре: их подставляет смена палитры.
  const PALETTES = [
    { id: 'classic', name: 'Классика', a: '#4F6BFF', b: '#8A6BFF', pair: ['sky', 'lemon'] },
    { id: 'forest', name: 'Лес', a: '#2AA873', b: '#67C993', pair: ['sky', 'coral'] },
    { id: 'sunset', name: 'Закат', a: '#E0702F', b: '#F0A14E', pair: ['sky', 'lemon'] },
    { id: 'violet', name: 'Сумерки', a: '#7C52DC', b: '#B06BE4', pair: ['teal', 'coral'] },
    { id: 'mono', name: 'Графит', a: '#5A6782', b: '#8C97AE', pair: ['violet', 'snow'] }
  ];
  const SHAPES = [
    { id: 'circle', name: 'Круг' }, { id: 'ring', name: 'Кольцо' }, { id: 'square', name: 'Квадрат' },
    { id: 'diamond', name: 'Ромб' }, { id: 'triangle', name: 'Треугольник' }, { id: 'hex', name: 'Шестиугольник' },
    { id: 'pentagon', name: 'Пятиугольник' }, { id: 'cross', name: 'Крест' }, { id: 'star', name: 'Звезда' },
    { id: 'bolt', name: 'Молния' }, { id: 'moon', name: 'Месяц' }, { id: 'flower', name: 'Цветок' }
  ];
  const ACT_WORD = { place: 'Сделать ход', shot: 'Выстрелить', anchor: 'Поставить якорь', moveAnchor: 'Сдвинуть якорь', magnet: 'Притянуть', unanchor: 'Забрать якорь' };
  const CFG_KEYS = ['size', 'win', 'secret', 'wallTtl', 'mem', 'anchor', 'shots', 'capture', 'timer', 'bank'];
  // Партия идёт до двух выигранных раундов. Ничейный раунд не засчитывается никому.
  const MATCH_WINS = 2;
  const NICK_RE = /^[A-Za-zА-Яа-яЁё0-9_.-]{3,20}$/;
  const CODE_RE = /^[A-Z0-9]{4,8}$/;

  // ---------- Settings (per browser) ----------
  const S = {
    opp: 'bot', theme: 'auto', palette: 'classic', logOpen: true, rulesOpen: false, sound: true, volume: 70,
    size: 13, win: 4, secret: true, wallTtl: 5, mem: 8, anchor: true, shots: 1, capture: false, timer: 0, bank: 60,
    look: { 1: { color: 'sky', shape: 'circle' }, 2: { color: 'lemon', shape: 'diamond' } }
  };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  try {
    const saved = JSON.parse(lsGet('ghost5-settings') || 'null');
    if (saved && typeof saved === 'object') {
      for (const k of ['opp', 'theme', 'palette', 'logOpen', 'rulesOpen', 'sound', 'volume'].concat(CFG_KEYS)) if (k in saved) S[k] = saved[k];
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
  if (!PALETTES.some((x) => x.id === S.palette)) S.palette = 'classic';
  S.volume = Math.max(0, Math.min(100, Number(S.volume) || 0));
  const save = () => lsSet('ghost5-settings', JSON.stringify(S));
  const pickCfg = (src) => { const c = {}; CFG_KEYS.forEach((k) => { c[k] = src[k]; }); return c; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- Supabase ----------
  const CONF = window.GHOST_CONFIG || {};
  // Пауза перед отправкой хода: всегда три секунды. Тестовый стенд выключает её своим config.js.
  const HOLD = Number.isFinite(Number(CONF.hold)) ? Math.max(0, Number(CONF.hold)) : 3;
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
  const ROUTES = ['auth', 'play', 'online', 'game', 'top', 'look', 'profile', 'rules', 'archive'];
  const TABS = ['play', 'online', 'top', 'look', 'profile'];
  const R = { route: 'auth' };
  const online = () => R.route === 'game';
  const Lc = { st: null, cfg: null, phase: 'pick', pending1: null, score: { 1: 0, 2: 0, d: 0 }, starter: 2 };
  const ui = { sel: null, action: 'place', take: -1, view: -1 };
  // Ход, отложенный на пару секунд: его ещё можно отменить.
  let hold = null;
  let busy = false;
  const O = {
    // account
    authReady: false, myId: null, email: '', profile: undefined, recovery: false, guest: false,
    authView: 'login', authEmail: '', authBusy: false, authMsg: '', authErr: false,
    profileMsg: '', profileErr: false,
    // home
    friends: [], games: [], invites: [], names: {}, ratings: {}, top: [], topMsg: '', rated: '',
    homeMsg: '', friendMsg: '', friendErr: false, confirmResign: false, confirmDelete: '', confirmQuit: '',
    homeChan: null, homePoll: null, homeSeq: 0, confirmRemove: null,
    // one game
    code: null, game: null, st: null, moves: { 1: null, 2: null }, notFound: false, hideResult: '',
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
    // Открытая партия и есть раздел «По сети»: уход в другой раздел её не закрывает,
    // ходы соперника продолжают приходить. Выйти к списку можно кнопкой «Все партии».
    if (route === 'online' && O.code) route = 'game';
    const was = R.route;
    R.route = route;
    if (was !== route) resetUi();
    syncHash();
    if (route === 'online' && O.myId) refreshHome();
    if (route === 'top' && O.myId) loadTop();
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
  // Вид фишек у каждого свой: слот 1 — всегда «мои», слот 2 — «соперника»,
  // поэтому для второго игрока места меняются местами.
  const slotOf = (p) => (inOnlineGame() && mySeat() === 2 ? 3 - p : p);
  const lookOf = (p) => S.look[slotOf(p)] || S.look[1];
  const colorOf = (p) => COLORS.find((c) => c.id === lookOf(p).color) || COLORS[0];
  const capWord = (s) => s[0].toUpperCase() + s.slice(1);
  const fmtSpan = (sec) => (sec >= 60 ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : sec + ' с');
  // Когда в партии последний раз что-то происходило.
  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
    const yesterday = new Date(now.getTime() - 86400000);
    if (day(d) === day(now)) return 'сегодня в ' + time;
    if (day(d) === day(yesterday)) return 'вчера в ' + time;
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    return (d.getFullYear() === now.getFullYear() ? date : date + ' ' + d.getFullYear()) + ', ' + time;
  }
  // Русское склонение после числа: 1 победа, 2 победы, 5 побед.
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b > 1 && b < 5) return few;
    return many;
  }
  const resetUi = () => { ui.sel = null; ui.action = 'place'; ui.take = -1; ui.view = -1; };

  function mySeat() {
    if (!O.game || !O.myId) return 0;
    return O.game.p1 === O.myId ? 1 : O.game.p2 === O.myId ? 2 : 0;
  }
  const inOnlineGame = () => !!O.game && !!mySeat();
  // Партия не начата: ни одного разрешённого хода, отменить её может любой из двоих.
  const notStarted = (st) => !!st && !st.over && (st.round || 1) === 1 && (st.moves || 0) === 0;
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
    if (!w) {
      if (reason === 'misses') return 'Ничья: оба пропустили три хода подряд.';
      return reason === 'both' ? 'Ничья: победа у обоих в одном ходе.' : 'Ничья: поле заполнено.';
    }
    const who = names()[w];
    if (reason === 'misses') {
      const loser = names()[3 - w];
      const tail = who === 'Вы' ? 'Побеждаете вы.' : 'Побеждает ' + who + '.';
      return loser + (loser === 'Вы' ? ' пропустили' : ' пропускает') + ' три хода подряд. ' + tail;
    }
    if (reason === 'resign') {
      const loser = names()[3 - w];
      if (loser === 'Вы') return 'Вы сдались. Побеждает ' + who + '.';
      return loser + ' сдаётся. ' + (who === 'Вы' ? 'Побеждаете вы.' : 'Побеждает ' + who + '.');
    }
    const row = E.rowLen(curCfg()) === 4 ? 'четвёрку' : 'пятёрку';
    if (who === 'Вы') return reason === 'caps' ? 'Победа! Вы захватили 5 пар.' : 'Победа! Вы собрали ' + row + '.';
    return who + (reason === 'caps' ? ' захватывает 5 пар.' : ' собирает ' + row + '.');
  }
  // Нотация клетки: столбцы буквами (без I), строки снизу вверх, как на шахматной доске.
  const FILES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function cellName(st, i) {
    if (typeof i !== 'number' || i < 0 || !st) return '';
    const n = st.n;
    return FILES[i % n] + (n - ((i / n) | 0));
  }
  const nameRef = (p) => ({ nm: p });
  const cellRef = (i) => ({ pos: i });
  const hasCell = (i) => typeof i === 'number' && i >= 0;

  // Части записи в журнале: строки, имена игроков (их красит цвет) и клетки.
  function evParts(e) {
    const at = (i, before) => (hasCell(i) ? [before, cellRef(i)] : []);
    switch (e.k) {
      case 'start': return e.secret ? ['Новая партия. Оба ходят одновременно.'] : ['Новая партия. Первый ход: ', nameRef(e.starter), '.'];
      case 'open': return ['Ходы открыты.'];
      case 'burn': return e.anchor
        ? ['Якорь и ход соперника сошлись', ...at(e.i, ' на '), ' — клетка сгорела.']
        : ['Оба выбрали одну клетку', ...at(e.i, ' '), ' — она сгорела.'];
      case 'place': return [nameRef(e.p), ...at(e.i, ': '), '.'];
      case 'anchor': return [nameRef(e.p), ': якорь', ...at(e.i, ' на '), '.'];
      case 'anchorSet': return [nameRef(e.p), ': фишка', ...at(e.i, ' '), ' стала якорем.'];
      case 'anchorMove': return [nameRef(e.p), ': якорь', ...at(e.from, ' '), ...at(e.i, ' → '), e.wall ? ', стена сломана.' : '.'];
      case 'magnet': return [nameRef(e.p), ': магнит', ...at(e.from, ' от якоря '), e.n ? ' притянул фишек: ' + e.n + '.' : ' сработал вхолостую.'];
      case 'unanchor': return [nameRef(e.p), ': якорь', ...at(e.i, ' с '), ' убран в запас.'];
      case 'hit': return [nameRef(e.p), e.guessed ? ': ход угадан, фишка' : ': выстрел, фишка', ...at(e.i, ' '), ' сбита.'];
      case 'miss': return [nameRef(e.p), ': выстрел мимо', ...at(e.i, ', '), '.'];
      case 'anchorMiss': return [nameRef(e.p), ': выстрел в якорь', ...at(e.i, ' '), ' — его не сбить.'];
      case 'cap': return [nameRef(e.p), ': ' + (e.n === 1 ? 'захвачена пара' : 'захвачено пар: ' + e.n) + ' (' + e.total + '/5).'];
      case 'vanish': return [nameRef(e.p), ': исчезла старая фишка', ...at(e.i, ' '), '.'];
      case 'wallGone':
      case 'cool': return [e.n === 1 ? 'Одна стена разрушилась.' : 'Разрушено стен: ' + e.n + '.'];
      case 'bankBack': return [nameRef(e.p), ': запас времени восстановлен.'];
      case 'pass': return [nameRef(e.p), ': ход пропущен.'];
      case 'result': return [resultText(e.w, e.reason)];
      default: return [];
    }
  }

  function renderLog(st) {
    const log = $('log');
    if (log.contains(document.querySelector('.pos:hover'))) spotCell(-1, false);
    log.innerHTML = '';
    const nm = names();
    for (const rec of st.log) {
      const row = li(rec.kind || '');
      const b = document.createElement('b');
      b.textContent = rec.tag;
      const box = document.createElement('span');
      for (const e of rec.ev) {
        const parts = evParts(e);
        if (!parts.length) continue;
        const one = document.createElement('span');
        one.className = 'ev ev-' + e.k;
        for (const part of parts) {
          if (typeof part === 'string') { one.appendChild(document.createTextNode(part)); continue; }
          const el = document.createElement('span');
          if (part.nm !== undefined) { el.className = 'nm n' + part.nm; el.textContent = nm[part.nm]; }
          else { el.className = 'pos'; el.textContent = cellName(st, part.pos); if (hasCell(part.pos)) el.dataset.i = part.pos; }
          one.appendChild(el);
        }
        box.appendChild(one);
      }
      row.append(b, box);
      log.appendChild(row);
    }
  }

  function cfgSummary(cfg) {
    if (!cfg) return '';
    const parts = [cfg.size + '×' + cfg.size, E.rowLen(cfg) + ' в ряд'];
    if (cfg.secret) parts.push('тайный ход');
    if (cfg.mem) parts.push('память ' + cfg.mem);
    if (E.anchorOn(cfg)) parts.push('якорь');
    if (cfg.shots) parts.push('выстрелы ' + cfg.shots);
    if (cfg.capture) parts.push('захват');
    if (cfg.timer) parts.push(cfg.timer + ' с на ход' + (cfg.bank ? ' + запас ' + fmtSpan(cfg.bank) : ''));
    return parts.join(' · ');
  }

  // ---------- Local play ----------
  function newLocal(keepScore) {
    if (!keepScore || matchWin(Lc.score)) Lc.score = zeroScore();
    Lc.starter = 3 - Lc.starter;
    Lc.cfg = pickCfg(S);
    Lc.st = E.make(Lc.cfg, Lc.starter, 1);
    Lc.phase = Lc.cfg.secret ? 'pick1' : 'pick';
    Lc.pending1 = null; busy = false;
    resetUi();
    render();
    maybeBot();
  }
  // Победитель партии: тот, кто первым взял нужное число раундов. 0 — партия ещё идёт.
  const matchWin = (score) => (score[1] >= MATCH_WINS ? 1 : score[2] >= MATCH_WINS ? 2 : 0);
  const zeroScore = () => ({ 1: 0, 2: 0, d: 0 });
  const curScore = () => (online() ? Object.assign(zeroScore(), O.game && O.game.score) : Lc.score);
  function bumpScore(score, st) {
    const k = st.winner ? String(st.winner) : 'd';
    score[k] = (score[k] || 0) + 1;
    // Сдача — отказ от всей партии: сопернику достаются и оставшиеся раунды.
    if (st.winner && st.winReason === 'resign') score[String(st.winner)] = MATCH_WINS;
  }
  function localRound(m1, m2) {
    const st = Lc.st;
    E.resolveRound(st, Lc.cfg, m1, m2);
    if (st.over) { bumpScore(Lc.score, st); saveGame(st, Lc.cfg, Lc.score); }
    Lc.phase = 'pick1'; Lc.pending1 = null;
    render();
  }
  function localSeq(p, m) {
    const st = Lc.st;
    E.resolveSeq(st, Lc.cfg, p, m);
    if (st.over) { bumpScore(Lc.score, st); saveGame(st, Lc.cfg, Lc.score); }
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

  // ---------- Архив сыгранных партий ----------
  const ARCHIVE_MAX = 15;
  function loadArchive() {
    try { return JSON.parse(lsGet('ghost5-archive') || '[]') || []; } catch (e) { return []; }
  }
  function saveGame(st, cfg, score) {
    if (!st || !st.over || !st.frames || st.frames.length < 2) return;
    const nm = names();
    const rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      when: new Date().toISOString(),
      cfg: clone(cfg), frames: st.frames.slice(-E.FRAMES), log: st.log.slice(0, 16),
      winner: st.winner, reason: st.winReason, score: clone(score), names: { 1: nm[1], 2: nm[2] }
    };
    const all = [rec].concat(loadArchive()).slice(0, ARCHIVE_MAX);
    lsSet('ghost5-archive', JSON.stringify(all));
  }
  // Лёгкое состояние только для просмотра: ходить в нём нельзя.
  function replayState(rec) {
    const last = rec.frames[rec.frames.length - 1];
    const cells = last.c.split('').map(Number);
    const n = Math.round(Math.sqrt(cells.length));
    return {
      n, cells, q: { 1: [], 2: [] }, anchors: [], anchorSet: {}, anchorLeft: { 1: 0, 2: 0 },
      shots: { 1: 0, 2: 0 }, caps: { 1: 0, 2: 0 }, walls: [], scar: [], misses: { 1: 0, 2: 0 },
      bank: { 1: 0, 2: 0 }, clean: { 1: 0, 2: 0 }, frames: rec.frames,
      round: 1, moves: 0, turn: 1, starter: 1, gameNo: 1,
      over: true, winner: rec.winner, winLine: [], winReason: rec.reason,
      last: last.l || [], log: rec.log || [], fx: { fresh: [], gone: [], burn: -1, slide: [] }
    };
  }
  function openArchive(id) {
    const rec = loadArchive().find((x) => x.id === id);
    if (!rec) return;
    if (!Lc.saved) Lc.saved = { st: Lc.st, cfg: Lc.cfg, phase: Lc.phase, pending1: Lc.pending1 };
    Lc.st = replayState(rec);
    Lc.cfg = rec.cfg;
    Lc.phase = 'pick';
    O.hideResult = 'archive';
    if (online()) { closeGame(); }
    go('play');
    // Позицию ставим после перехода: смена раздела сбрасывает выбор.
    ui.view = 0;
    render();
  }
  function closeArchive() {
    if (!Lc.saved) return;
    Lc.st = Lc.saved.st; Lc.cfg = Lc.saved.cfg; Lc.phase = Lc.saved.phase; Lc.pending1 = Lc.saved.pending1;
    Lc.saved = null;
    ui.view = -1;
    render();
  }
  function renderArchive() {
    const host = $('archive');
    const all = loadArchive();
    host.innerHTML = '';
    if (!all.length) { emptyLine(host, 'Партии появятся здесь, когда вы доиграете хотя бы одну.'); return; }
    for (const rec of all) {
      const row = li();
      const who = rec.winner ? (rec.names[rec.winner] || 'Игрок ' + rec.winner) + ' победил' : 'ничья';
      row.append(
        info(who, cfgSummary(rec.cfg), fmtWhen(rec.when)),
        btns(btn('Смотреть', { act: 'replay', id: rec.id }))
      );
      host.appendChild(row);
    }
  }

  // ---------- Moves (shared entry point) ----------
  // Подсветка координат только из журнала: над полем она мешала выбирать ход.
  $('log').addEventListener('mouseover', (e) => {
    const p = e.target.closest('.pos');
    if (p && p.dataset.i !== undefined) spotCell(+p.dataset.i, true);
  });
  $('log').addEventListener('mouseout', (e) => {
    if (e.target.closest('.pos')) spotCell(-1, false);
  });

  boardEl.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (b) onCell(+b.dataset.i);
  });
  function onCell(i) {
    const st = curSt();
    if (!st || st.over || busy) return;
    const p = picker();
    if (!p || !isHuman(p) || !E.validTarget(st, curCfg(), p, i, ui.action)) return;
    // Повторное нажатие снимает выбор: ход уходит только кнопкой.
    ui.sel = ui.sel === i ? null : i;
    render();
  }
  function setAction(a) {
    const st = curSt(), cfg = curCfg(), p = picker();
    if (!st || !p || !isHuman(p) || busy) return;
    if (a === 'shot' && !E.canShoot(st, cfg, p)) return;
    if (a === 'moveAnchor' && E.anchorOf(st, p) < 0) return;
    if (a === 'anchor' && !E.canAnchor(st, cfg, p)) return;
    if (a === 'magnet' && !E.canMagnet(st, cfg, p)) return;
    ui.action = a;
    if (ui.sel !== null && !E.validTarget(st, cfg, p, ui.sel, a)) ui.sel = null;
    render();
  }
  function confirmMove() {
    const st = curSt();
    if (!st) return;
    if (st.over) {
      if (online()) { if (mySeat()) onlineRematch(); } else newLocal(true);
      return;
    }
    const p = picker();
    if (!p || !isHuman(p) || ui.sel === null || busy) return;
    const cfg = curCfg();
    const take = ui.take >= 0 && E.canUnanchor(st, cfg, p, ui.take) ? ui.take : false;
    const m = { i: ui.sel, kind: ui.action, anchor: false, take, spent: overSpend(st, cfg) };
    // Пауза перед отправкой: успеть одуматься, если нажал не глядя.
    const wait = HOLD;
    if (wait && timeLeft(st, cfg) > wait + 1) {
      hold = { m, until: Date.now() + wait * 1000, p };
      resetUi();
      SFX.move();
      render();
      return;
    }
    resetUi();
    SFX.move();
    sendMove(m, p);
  }

  // Сколько секунд у игрока осталось всего: основное время плюс запас.
  function timeLeft(st, cfg) {
    if (!cfg.timer) return Infinity;
    const seat = timerSeat();
    if (!seat || !T.key) return Infinity;
    const used = (Date.now() - T.start) / 1000;
    const bank = cfg.bank ? (st.bank && st.bank[seat]) || 0 : 0;
    return Math.max(0, cfg.timer - used) + bank;
  }

  function sendMove(m, p) {
    const st = curSt(), cfg = curCfg();
    if (!st) return;
    if (online()) { if (cfg.secret) commitMove(m); else onlineSeq(m); return; }
    if (cfg.secret) {
      if (Lc.phase === 'pick1') {
        Lc.pending1 = m;
        if (S.opp === 'bot') localRound(m, botDecide(st, cfg, 2));
        else { Lc.phase = 'handoff'; render(); }
      } else if (Lc.phase === 'pick2') localRound(Lc.pending1, m);
    } else localSeq(p || picker() || 1, m);
  }

  function dropHold() {
    if (!hold) return;
    hold = null;
    render();
  }

  // Ждать отсчёт необязательно: «Подтвердить» отправляет ход сразу.
  function sendHoldNow() {
    if (!hold) return;
    const m = hold.m, p = hold.p;
    hold = null;
    sendMove(m, p);
  }

  // ---------- Меню действий на клетке ----------
  // Правая кнопка (или долгое нажатие) показывает, что можно сделать именно с этой клеткой.
  function cellMenuItems(st, cfg, p, i) {
    const out = [];
    const can = (kind) => E.validTarget(st, cfg, p, i, kind);
    if (can('place')) out.push({ kind: 'place', label: 'Поставить фишку' });
    if (cfg.shots && E.canShoot(st, cfg, p) && can('shot')) {
      out.push({ kind: 'shot', label: 'Выстрелить сюда', note: 'осталось ' + st.shots[p] });
    }
    if (can('anchor')) out.push({ kind: 'anchor', label: st.cells[i] === p ? 'Сделать эту фишку якорем' : 'Поставить якорь' });
    if (can('moveAnchor')) out.push({ kind: 'moveAnchor', label: 'Сдвинуть якорь сюда', note: st.cells[i] === 3 ? 'проломит стену' : '' });
    if (can('magnet')) out.push({ kind: 'magnet', label: 'Притянуть по этому лучу', note: 'до 4 фишек' });
    // На самом якоре предлагаем забрать именно его, иначе — тот, что стоит дольше всех.
    const own = st.cells[i] === p && st.anchors.includes(i);
    if (own) {
      const age = E.anchorAge(st, cfg, i), left = E.ANCHOR_HOLD - age;
      out.push({ info: true, label: 'Щит', note: 'соседние фишки не стареют' });
      out.push({ info: true, label: 'Сдвиг', note: 'ломает стену, оставляет след' });
      out.push({ info: true, label: 'Магнит', note: 'тянет по лучу до 4 фишек' });
      out.push({ info: true, label: 'Выстрел', note: 'якорь не сбить' });
      out.push({ info: true, label: 'Возврат', note: left > 0 ? 'через ' + left : 'доступен' });
    }
    const which = own && E.canUnanchor(st, cfg, p, i) ? i : E.ripeAnchor(st, cfg, p);
    if (which >= 0) {
      const marked = ui.take === which;
      out.push({
        take: which,
        label: marked ? 'Не забирать якорь' : own ? 'Забрать этот якорь' : 'Забрать якорь ' + cellName(st, which),
        note: 'без хода', on: marked
      });
    }
    return out;
  }

  function closeCellMenu() {
    const box = $('cellMenu');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; }
  }

  function openCellMenu(i, x, y) {
    const st = curSt(), cfg = curCfg(), p = picker();
    closeCellMenu();
    if (!st || st.over || busy || !p || !isHuman(p)) return;
    const items = cellMenuItems(st, cfg, p, i);
    if (!items.length) return;
    const box = $('cellMenu');
    box.innerHTML = '<div class="mhead">Клетка ' + esc(cellName(st, i)) + '</div>' +
      items.map((it, k) => (it.info
        ? '<span class="minfo"><span>' + esc(it.label) + '</span><small>' + esc(it.note || '') + '</small></span>'
        : '<button type="button" role="menuitem" data-k="' + k + '"' + (it.on ? ' class="on"' : '') + '>' +
          '<span>' + esc(it.label) + '</span>' + (it.note ? '<small>' + esc(it.note) + '</small>' : '') + '</button>')).join('');
    box.dataset.cell = String(i);
    menuItems = items;
    box.hidden = false;
    // Прижимаем к курсору, но не даём уехать за край экрана.
    const r = box.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - r.width - 8);
    const top = Math.min(y, window.innerHeight - r.height - 8);
    box.style.left = Math.max(8, left) + 'px';
    box.style.top = Math.max(8, top) + 'px';
    const first = box.querySelector('button');
    if (first) first.focus();
  }

  let menuItems = [];
  function chooseMove(i, kind) {
    const st = curSt(), cfg = curCfg(), p = picker();
    if (!st || !p || !isHuman(p) || busy || !E.validTarget(st, cfg, p, i, kind)) return;
    ui.action = kind;
    ui.sel = i;
    render();
  }

  boardEl.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('.cell');
    if (!c) return;
    e.preventDefault();
    openCellMenu(+c.dataset.i, e.clientX, e.clientY);
  });
  $('cellMenu').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = menuItems[+b.dataset.k];
    const i = +$('cellMenu').dataset.cell;
    closeCellMenu();
    if (!it) return;
    if (typeof it.take === 'number') {
      const st = curSt(), cfg = curCfg(), p = picker();
      if (st && p && E.canUnanchor(st, cfg, p, it.take)) {
        ui.take = ui.take === it.take ? -1 : it.take;
        if (ui.take >= 0 && ui.action === 'moveAnchor') setAction('place'); else render();
      }
      return;
    }
    chooseMove(i, it.kind);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('cellMenu').hidden && !e.target.closest('#cellMenu')) closeCellMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCellMenu(); });
  window.addEventListener('scroll', closeCellMenu, true);
  window.addEventListener('resize', closeCellMenu);

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
    const str = [pl.gameNo, pl.round, pl.i, pl.kind, pl.anchor ? 1 : 0, pl.take === false || pl.take == null ? -1 : pl.take, pl.spent || 0, pl.salt].join('|');
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
    const { data } = await sb.from('profiles').select('id,nickname,rating').in('id', need);
    let changed = false;
    (data || []).forEach((r) => {
      if (O.names[r.id] !== r.nickname) { O.names[r.id] = r.nickname; changed = true; }
      if (O.ratings[r.id] !== r.rating) { O.ratings[r.id] = r.rating; changed = true; }
    });
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
      loadTop();
      if (pendingCode && !O.recovery) { const c = pendingCode; setPending(''); openGame(c, true); return; }
      go(O.recovery ? 'auth' : routeFromHash() || 'play');
      return;
    }
    O.profile = undefined;
    O.recovery = false;
    stopHome();
    closeGame();
    go('auth');
  }
  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('id,nickname,rating,wins,losses,draws').eq('id', O.myId).maybeSingle();
    if (error) { O.profile = null; O.homeMsg = 'Не удалось загрузить профиль: ' + errText(error); render(); return; }
    O.profile = data || null;
    if (data) { O.names[data.id] = data.nickname; O.ratings[data.id] = data.rating; }
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
    O.profile = Object.assign({}, O.profile, { id: O.myId, nickname: nick });
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
    const cols = 'code,p1,p2,invitee,status,cfg,updated_at,over:state->over,turn:state->turn,round:state->round,moves:state->moves';
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
    for (let t = 0; t < 5; t++) {
      const code = genCode();
      // looks остаётся в схеме, но на экран уже не влияет: каждый красит фишки у себя.
      const row = { code, p1: O.myId, status: 'waiting', cfg, looks: clone(S.look), state: st, score: { 1: 0, 2: 0, d: 0 } };
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
  function askQuit(code) {
    if (O.confirmQuit !== code) {
      O.confirmQuit = code;
      render();
      setTimeout(() => { if (O.confirmQuit === code) { O.confirmQuit = ''; render(); } }, 4000);
      return;
    }
    O.confirmQuit = '';
    quitGame(code);
  }

  // Сдаться, не открывая партию: состояние берём с сервера, чтобы не разойтись с соперником.
  async function quitGame(code) {
    const { data, error } = await sb.from('games').select('*').eq('code', code).maybeSingle();
    if (error || !data) { O.homeMsg = 'Не удалось сдаться: партия не найдена.'; render(); return; }
    const seat = data.p1 === O.myId ? 1 : data.p2 === O.myId ? 2 : 0;
    const st = data.state;
    if (!seat || !st || st.over) { refreshHome(); return; }
    const st2 = clone(st);
    E.resign(st2, data.cfg, seat);
    const sc = Object.assign({ 1: 0, 2: 0, d: 0 }, data.score);
    bumpScore(sc, st2);
    const up = await sb.from('games').update({ state: st2, score: sc })
      .eq('code', code).eq('state->>gameNo', String(st.gameNo));
    if (up.error) { O.homeMsg = 'Не удалось сдаться: ' + errText(up.error); render(); return; }
    await sb.rpc('report_result', { g: code });
    loadProfile();
    refreshHome();
  }

  function askDelete(code) {
    if (O.confirmDelete !== code) {
      O.confirmDelete = code;
      render();
      setTimeout(() => { if (O.confirmDelete === code) { O.confirmDelete = ''; render(); } }, 4000);
      return;
    }
    O.confirmDelete = '';
    deleteGame(code);
  }

  async function deleteGame(code) {
    const { error } = await sb.from('games').delete().eq('code', code);
    if (error) { O.homeMsg = O.msg = 'Не удалось удалить партию: ' + errText(error); render(); return; }
    if (O.code === code) { closeGame(); go('online'); return; }
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
      // Пока за столом нет второго игрока, его приход ждём опросом, а не только живым каналом.
      const waiting = !!O.game && !O.game.p2;
      if (waiting ? gap > 2000 : (!O.live && gap > 3000) || gap > 15000) fetchGame();
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
    if (O.game && !O.game.p2 && g.data.p2 && O.game.code === g.data.code) SFX.join();
    O.game = g.data;
    O.st = g.data.state;
    const mv = { 1: null, 2: null };
    (m.data || []).forEach((r) => { mv[r.seat] = { gameNo: r.game_no, round: r.round, commit: r.commit, reveal: r.reveal }; });
    O.moves = mv;
    if (O.st) {
      const key = O.st.gameNo + ':' + O.st.round;
      if (O.revealing && O.revealing !== key) O.revealing = '';
    }
    const ids = [g.data.p1, g.data.p2, g.data.invitee].filter((x) => x && (!O.names[x] || O.ratings[x] === undefined));
    if (ids.length) fetchNames(ids);
    render();
    tick();
    if (O.st && O.st.over) reportResult();
  }

  async function joinGame() {
    O.joining = true; O.msg = ''; render();
    const { data, error } = await sb.rpc('join_game', { g: O.code, my_look: clone(S.look[1]) });
    O.joining = false;
    if (gameErr(error, 'Не удалось сесть за стол')) return;
    if (!data) O.msg = 'Сесть за этот стол не получилось: место уже занято или приглашение было не вам.';
    // Запросы, ушедшие до посадки, вернут состояние без второго игрока: помечаем их устаревшими.
    O.fetchSeq++;
    await fetchGame();
    render();
  }

  async function commitMove(m) {
    const st = O.st, me = mySeat(), code = O.code;
    if (!st || !me) return;
    const pl = { gameNo: st.gameNo, round: st.round, i: m.i, kind: m.kind, anchor: !!m.anchor, take: m.take === false || m.take == null ? false : m.take, spent: m.spent || 0, salt: randSalt() };
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
    // Свой ход показываем принятым сразу, не дожидаясь ответа на следующий запрос.
    O.moves[me] = { gameNo: pl.gameNo, round: pl.round, commit, reveal: null };
    render();
    fetchGame();
  }

  // Отменить можно, пока соперник ещё выбирает: как только сходил он, ходы начинают раскрываться.
  function canCancel() {
    if (!online() || !O.game || !O.st || O.st.over || !O.game.cfg.secret || !O.game.p2) return false;
    const me = mySeat();
    if (!me || O.committing) return false;
    return seatDone(me) && !moveCurrent(O.moves[3 - me], O.st);
  }

  async function cancelMove() {
    if (!canCancel()) return;
    const st = O.st, me = mySeat(), code = O.code;
    O.committing = true; O.msg = ''; render();
    // Пустой хеш означает «хода нет»: соперник снова видит, что вы выбираете.
    const { error } = await sb.from('moves').upsert(
      { game_code: code, seat: me, game_no: st.gameNo, round: st.round, commit: '', reveal: null },
      { onConflict: 'game_code,seat' }
    );
    O.committing = false;
    if (gameErr(error, 'Не удалось отменить ход')) return;
    O.plain = null;
    savePlain(code, null);
    O.moves[me] = null;
    resetUi();
    render();
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
        .update({ reveal: { i: pl.i, kind: pl.kind, anchor: pl.anchor, take: pl.take === false ? false : pl.take, spent: pl.spent || 0, salt: pl.salt } })
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
        const pl = { gameNo: d.gameNo, round: d.round, i: r.i, kind: r.kind, anchor: !!r.anchor, take: r.take === false || r.take == null ? false : r.take, spent: +r.spent || 0, salt: r.salt };
        const ok = (await hashPlain(pl)) === d.commit;
        let m = { i: pl.i, kind: pl.kind, anchor: pl.anchor, take: pl.take, spent: pl.spent };
        // Подделанный ход отбрасываем целиком, невозможный — только его ходовую часть.
        if (!ok) m = { kind: 'pass' };
        else if (!E.validTarget(st, g.cfg, s, m.i, m.kind) || (m.kind === 'shot' && st.shots[s] <= 0)) m = { kind: 'pass', take: m.take, spent: m.spent };
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
    // После партии правила можно поменять: новую начинаем с теми, что выбраны сейчас.
    const cfg = pickCfg(S);
    const st2 = E.make(cfg, 3 - st.starter, st.gameNo + 1);
    O.rated = '';
    // Партия доиграна — счёт обнуляем и начинаем новую; иначе это просто следующий раунд.
    const upd = { cfg, state: st2, rated: false };
    if (matchWin(Object.assign(zeroScore(), g.score))) upd.score = zeroScore();
    const { error } = await sb.from('games').update(upd)
      .eq('code', code).eq('state->>gameNo', String(st.gameNo));
    if (gameErr(error, 'Не удалось начать новый раунд')) return;
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
    navigator.share({ title: 'Ghost Five', text: 'Сыграем? Код партии ' + O.code, url: gameLink(O.code) }).catch(() => {});
  }

  async function loadTop() {
    if (!sb || !O.myId) return;
    O.topMsg = '';
    const { data, error } = await sb.from('profiles')
      .select('id,nickname,rating,wins,losses,draws')
      .order('rating', { ascending: false })
      .limit(50);
    if (error) { O.topMsg = 'Не удалось загрузить таблицу: ' + errText(error); render(); return; }
    O.top = data || [];
    O.top.forEach((r) => { O.names[r.id] = r.nickname; O.ratings[r.id] = r.rating; });
    render();
  }

  // Итог считает база: она сама смотрит на сохранённое состояние партии.
  async function reportResult() {
    const g = O.game, st = O.st, code = O.code;
    if (!sb || !g || !st || !st.over || !g.p2 || g.rated) return;
    const key = code + ':' + st.gameNo;
    if (O.rated === key) return;
    O.rated = key;
    const { error } = await sb.rpc('report_result', { g: code });
    if (error) { O.rated = ''; return; }
    await fetchNames([g.p1, g.p2].filter(Boolean));
    loadProfile();
    fetchGame();
  }

  function resign() {
    const st = curSt(), cfg = curCfg();
    if (!st || st.over) return;
    if (!O.confirmResign) {
      O.confirmResign = true;
      render();
      setTimeout(() => { if (O.confirmResign) { O.confirmResign = false; render(); } }, 4000);
      return;
    }
    O.confirmResign = false;
    resetUi();
    if (online()) { onlineResign(); return; }
    const p = picker() || 1;
    E.resign(st, cfg, p);
    bumpScore(Lc.score, st);
    busy = false;
    render();
  }

  async function onlineResign() {
    const g = O.game, st = O.st, me = mySeat(), code = O.code;
    if (!g || !st || !me || st.over) return;
    const st2 = clone(st);
    E.resign(st2, g.cfg, me);
    const sc = Object.assign({ 1: 0, 2: 0, d: 0 }, g.score);
    bumpScore(sc, st2);
    O.committing = true; render();
    const { error } = await sb.from('games').update({ state: st2, score: sc })
      .eq('code', code).eq('state->>gameNo', String(st.gameNo));
    O.committing = false;
    if (gameErr(error, 'Не удалось сдаться')) return;
    fetchGame();
  }

  // ---------- Звук ----------
  // Сигналы синтезируются на лету: ни одного файла и никакой загрузки.
  const SFX = (() => {
    let ctx = null;
    function audio() {
      if (!S.sound || !S.volume) return null;
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        if (!ctx) ctx = new Ctor();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) { return null; }
    }
    function blip(freq, dur, o) {
      const c = audio();
      if (!c) return;
      const opt = o || {};
      const t0 = c.currentTime + (opt.at || 0);
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to), t0 + dur);
      const vol = (opt.gain == null ? 0.07 : opt.gain) * (S.volume / 100);
      if (vol <= 0.0005) return;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }
    const seq = (notes, o) => notes.forEach((n, k) => blip(n, (o && o.dur) || 0.14, Object.assign({}, o, { at: k * ((o && o.step) || 0.1) })));
    return {
      ready: () => !!audio(),
      move: () => blip(560, 0.09, { to: 440 }),
      shot: () => blip(900, 0.18, { to: 120, type: 'sawtooth', gain: 0.05 }),
      burn: () => blip(190, 0.28, { to: 80, type: 'square', gain: 0.05 }),
      anchor: () => seq([330, 494], { dur: 0.16, step: 0.08, type: 'triangle' }),
      capture: () => seq([660, 880], { dur: 0.13, step: 0.07 }),
      tick: () => blip(1150, 0.05, { gain: 0.03, type: 'square' }),
      timeout: () => seq([300, 200], { dur: 0.22, step: 0.14, type: 'square', gain: 0.05 }),
      join: () => seq([587, 880], { dur: 0.2, step: 0.12, type: 'triangle' }),
      bank: () => seq([440, 294], { dur: 0.26, step: 0.16, type: 'triangle', gain: 0.055 }),
      bankTick: () => blip(520, 0.07, { gain: 0.035, type: 'triangle' }),
      win: () => {
        seq([523, 659, 784, 1047, 1319], { dur: 0.34, step: 0.1, type: 'triangle', gain: 0.075 });
        seq([262, 330, 392], { dur: 0.9, step: 0.01, type: 'sine', gain: 0.035 });
      },
      lose: () => seq([392, 330, 262], { dur: 0.36, step: 0.15, type: 'triangle', gain: 0.06 })
    };
  })();

  // Один звук на событие раунда: какофония из пяти сигналов сразу никому не нужна.
  function playRound(st) {
    const rec = st.log && st.log[0];
    if (!rec || !rec.ev.length) return;
    const has = (k) => rec.ev.some((e) => e.k === k);
    if (has('result')) {
      const w = st.winner, mine = online() ? mySeat() : 1;
      if (!w) SFX.timeout();
      else if (w === mine) SFX.win();
      else SFX.lose();
      return;
    }
    if (has('burn')) return SFX.burn();
    if (has('hit') || has('miss') || has('anchorMiss')) return SFX.shot();
    if (has('cap')) return SFX.capture();
    if (has('anchor') || has('anchorSet') || has('anchorMove') || has('unanchor')) return SFX.anchor();
    if (has('pass')) return SFX.timeout();
    if (has('place')) return SFX.move();
  }

  // ---------- Время на ход ----------
  // Отсчёт идёт у каждого свой, от момента, когда он увидел свою очередь:
  // общие часы потребовали бы серверного времени, а расхождение тут меньше задержки сети.
  const T = { key: '', start: 0, passed: '' };

  function timerKey() {
    const st = curSt(), cfg = curCfg();
    if (!st || !cfg || !cfg.timer || st.over) return '';
    if (online()) {
      const g = O.game, me = mySeat();
      if (!g || !g.p2 || !me || O.committing) return '';
      if (g.cfg.secret) return seatDone(me) ? '' : 'o' + st.gameNo + 'r' + st.round;
      return st.turn === me ? 'o' + st.gameNo + 'm' + st.moves : '';
    }
    if (R.route !== 'play' || busy) return '';
    if (cfg.secret) return Lc.phase === 'handoff' ? '' : 'l' + st.gameNo + 'r' + st.round + Lc.phase;
    return 'l' + st.gameNo + 'm' + st.moves + 't' + st.turn;
  }

  function timerSeat() {
    return online() ? mySeat() : picker();
  }

  // Сколько секунд этого хода уже взято из запаса.
  function overSpend(st, cfg) {
    if (!cfg.timer || !cfg.bank || !T.key) return 0;
    const seat = timerSeat();
    if (!seat) return 0;
    const over = (Date.now() - T.start) / 1000 - cfg.timer;
    if (over <= 0) return 0;
    const left = (st.bank && st.bank[seat]) || 0;
    return Math.min(left, Math.ceil(over));
  }

  function tickTimer() {
    if (hold) {
      if (Date.now() >= hold.until) {
        const m = hold.m, p = hold.p;
        hold = null;
        sendMove(m, p);
      } else if (R.route === 'play' || R.route === 'game') {
        const left = Math.ceil((hold.until - Date.now()) / 1000);
        const btn = $('confirm');
        btn.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Подтвердить · ' + left;
      }
    }
    const el = $('clock'), bk = $('bankClock');
    const key = timerKey();
    // Пауза (ход отправлен, идёт раскрытие) часы прячет, но отсчёт не сбрасывает:
    // иначе отмена хода дарила бы игроку полный лимит заново.
    if (!key) { el.hidden = true; bk.hidden = true; return; }
    if (T.key !== key) { T.key = key; T.start = Date.now(); T.passed = ''; }
    const st = curSt(), cfg = curCfg(), seat = timerSeat();
    const limit = cfg.timer, whole = cfg.bank || 0;
    const left = whole ? (st.bank && st.bank[seat]) || 0 : 0;
    const elapsed = (Date.now() - T.start) / 1000;
    const main = Math.max(0, limit - elapsed);
    const bankNow = Math.max(0, left - Math.max(0, elapsed - limit));

    el.hidden = false;
    $('clockText').textContent = Math.ceil(main) + ' с';
    $('clockBar').style.width = (limit ? (main / limit) * 100 : 0) + '%';
    el.classList.toggle('spent', main <= 0 && bankNow > 0);
    el.classList.toggle('low', main <= 5 && bankNow <= 0);

    bk.hidden = !whole;
    if (whole) {
      $('bankText').textContent = fmtSpan(Math.ceil(bankNow));
      $('bankBar').style.width = (bankNow / whole) * 100 + '%';
      bk.classList.toggle('active', main <= 0 && bankNow > 0);
      bk.classList.toggle('low', main <= 0 && bankNow > 0 && bankNow <= 5);
    }
    const inBank = main <= 0 && bankNow > 0;
    const mine = seat && isHuman(seat);
    // Переход на запас слышно отдельно: иначе время утекает молча.
    if (mine && inBank && T.phase !== 'bank' + key) { if (T.phase) SFX.bank(); T.phase = 'bank' + key; }
    if (!inBank && main > 0) T.phase = 'main' + key;
    const sec = Math.ceil(main > 0 ? main : bankNow);
    if (sec !== T.sec) {
      if (T.sec !== undefined && sec > 0 && mine) {
        if (sec <= 5) SFX.tick();
        else if (inBank && sec % 10 === 0) SFX.bankTick();
      }
      T.sec = sec;
    }
    if (main > 0 || bankNow > 0) return;
    if (T.passed === key) return;
    T.passed = key;
    timeUp();
  }

  function timeUp() {
    const st = curSt(), cfg = curCfg(), p = picker();
    if (!st || st.over || !p) return;
    // Клетку выбрали, но не успели подтвердить — ход всё равно идёт туда.
    const ready = ui.sel !== null && E.validTarget(st, cfg, p, ui.sel, ui.action);
    const take = ui.take >= 0 && E.canUnanchor(st, cfg, p, ui.take) ? ui.take : false;
    const spent = overSpend(st, cfg);
    const m = ready
      ? { i: ui.sel, kind: ui.action, anchor: false, take, spent }
      : { i: -1, kind: 'pass', anchor: false, take, spent };
    resetUi();
    SFX.move();
    if (online()) { if (cfg.secret) commitMove(m); else onlineSeq(m); return; }
    if (!cfg.secret) { localSeq(p, m); return; }
    if (Lc.phase === 'pick1') {
      Lc.pending1 = m;
      if (S.opp === 'bot') localRound(m, botDecide(st, cfg, 2));
      else { Lc.phase = 'handoff'; render(); }
    } else if (Lc.phase === 'pick2') localRound(Lc.pending1, m);
  }

  // ---------- Rendering: game ----------
  let builtN = 0, cellEls = [], cellKeys = [];
  let fxKey = '', fxDone = '';
  // Подсветка клетки: полосы до осей, подписи координат и, если нужно, кольцо на самой клетке.
  let spotIdx = -1;
  function markAxis(i, on) {
    if (!builtN) return;
    const r = $('ranks').children[(i / builtN) | 0], f = $('files').children[i % builtN];
    if (r) r.classList.toggle('on', on);
    if (f) f.classList.toggle('on', on);
  }
  function spotCell(i, ring) {
    const row = $('hoverRow'), col = $('hoverCol'), mark = $('cellRing');
    if (spotIdx >= 0 && spotIdx !== i) markAxis(spotIdx, false);
    spotIdx = i;
    if (i < 0 || !cellEls[i]) { row.hidden = true; col.hidden = true; mark.hidden = true; return; }
    const box = $('boardBox').getBoundingClientRect(), r = cellEls[i].getBoundingClientRect();
    const top = r.top - box.top, left = r.left - box.left;
    row.hidden = false; row.style.top = top + 'px'; row.style.height = r.height + 'px';
    col.hidden = false; col.style.left = left + 'px'; col.style.width = r.width + 'px';
    mark.hidden = !ring;
    if (ring) {
      mark.style.top = top + 'px'; mark.style.left = left + 'px';
      mark.style.width = r.width + 'px'; mark.style.height = r.height + 'px';
    }
    markAxis(i, true);
  }

  function renderAxes(n) {
    const ranks = $('ranks'), files = $('files');
    if (ranks.dataset.n === String(n)) return;
    ranks.dataset.n = String(n);
    ranks.style.gridTemplateRows = 'repeat(' + n + ', minmax(0, 1fr))';
    files.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    let r = '', f = '';
    for (let k = 0; k < n; k++) { r += '<span>' + (n - k) + '</span>'; f += '<span>' + FILES[k] + '</span>'; }
    ranks.innerHTML = r;
    files.innerHTML = f;
  }

  function ensureBoard(n) {
    renderAxes(n);
    if (builtN === n) return;
    spotCell(-1, false);
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

  }
  function cellLabel(st, i, v) {
    const n = st.n, r = ((i / n) | 0) + 1, c = (i % n) + 1;
    const what = v === 1 || v === 2 ? 'фишка: ' + names()[v] : v === 3 ? 'стена' : 'пусто';
    return 'Строка ' + r + ', столбец ' + c + ': ' + what;
  }

  // Свой ход, который уже отправлен и ждёт соперника: соперник его не видит.
  function pendingMove(st, cfg) {
    if (!online() || !cfg.secret || st.over || !hasPlain(st)) return null;
    const me = mySeat();
    if (!me || !seatDone(me)) return null;
    return O.plain;
  }

  // Просмотр прошлого хода: рисуем снимок поля, без подсказок и подсветок.
  function renderFrame(st, frame) {
    ensureBoard(st.n);
    const n = st.n, cells = frame.c.split('').map(Number);
    const last = new Set(frame.l || []), scars = new Set(frame.s || []);
    const sh = (pl) => ' sh-' + lookOf(pl).shape;
    boardEl.classList.remove('live');
    boardEl.classList.add('past');
    for (let i = 0; i < n * n; i++) {
      const v = cells[i];
      let cls = 'cell', inner = '';
      if (v === 3) cls += ' wall';
      else if (v === 1 || v === 2) {
        inner = '<span class="stone p' + v + sh(v) + '"></span>';
        if (last.has(i)) cls += ' last';
      } else {
        cls += ' empty';
        if (scars.has(i)) cls += ' scar s1';
      }
      const key = 'past|' + cls + '|' + inner;
      if (cellKeys[i] !== key) {
        const el = cellEls[i];
        el.className = cls; el.innerHTML = inner;
        el.setAttribute('aria-label', cellLabel(st, i, v));
        cellKeys[i] = key;
      }
    }
  }

  function frames(st) { return (st && st.frames) || []; }
  function viewFrame(st) {
    const all = frames(st);
    if (ui.view < 0 || !all.length) return null;
    return all[Math.min(ui.view, all.length - 1)] || null;
  }
  function stepView(delta) {
    const st = curSt(), all = frames(st);
    if (!all.length) return;
    const now = ui.view < 0 ? all.length - 1 : ui.view;
    const next = now + delta;
    ui.view = next >= all.length - 1 ? -1 : Math.max(0, next);
    render();
  }

  function renderBoard(st, cfg, p, human) {
    ensureBoard(st.n);
    const n = st.n, L = cfg.mem;
    const k = st.gameNo + ':' + st.round + ':' + st.moves + ':' + st.log.length;
    if (k !== fxKey) {
      if (fxKey) playRound(st);
      fxKey = k;
      setTimeout(() => { fxDone = k; render(); }, 750);
    }
    const none = { fresh: [], gone: [], burn: -1 };
    const fx = fxDone === fxKey ? none : (st.fx || none);
    const life = new Map();
    if (L) for (const pl of [1, 2]) st.q[pl].forEach((idx, j) => life.set(idx, L - st.q[pl].length + j + 1));
    const walls = new Map(st.walls);
    const scars = new Map(st.scar || []);
    const anchors = new Set(st.anchors);
    const winSet = new Set(st.winLine);
    const fresh = new Set(fx.fresh);
    // Магнит и сдвиг якоря: фишка выезжает из прежней клетки, а не возникает на новой.
    const slide = new Map((fx.slide || []).map(([a, b2]) => [b2, a]));
    const sh = (pl) => ' sh-' + lookOf(pl).shape;
    boardEl.classList.remove('past');
    boardEl.classList.toggle('live', human);
    // Отправленный, но ещё не раскрытый ход рисуем призраком: видно, куда вы сходили.
    const pend = pendingMove(st, cfg);
    // Пока идёт отсчёт, показываем, что именно задумано.
    const intent = hold ? hold.m : null;
    const me = mySeat() || p;
    const aim = (kind) => kind === 'shot' || kind === 'unanchor';
    const sign = (kind) => kind === 'anchor' || kind === 'moveAnchor';
    const fromCells = human && p && (ui.action === 'moveAnchor' || ui.action === 'magnet') ? E.anchorsOf(st, p) : [];
    for (let i = 0; i < n * n; i++) {
      const v = st.cells[i];
      let cls = 'cell', inner = '', style = '';
      const okHere = human && E.validTarget(st, cfg, p, i, ui.action);
      if (okHere) cls += ' ok';
      // Куда можно поставить или двинуть якорь — помечаем, иначе выбор неочевиден.
      if (okHere && (ui.action === 'moveAnchor' || ui.action === 'magnet' || (ui.action === 'anchor' && v === p))) cls += ' target';
      if (fromCells.includes(i)) cls += ' from';
      if (human && ui.take >= 0 && i === ui.take) cls += ' leaving';
      if (v === 3) {
        cls += ' wall' + (fx.burn === i ? ' burn' : '');
        const ttl = walls.get(i);
        if (cfg.wallTtl && ttl) {
          if (ttl <= 3) inner = '<span class="badge">' + ttl + '</span>';
          if (ttl === 1) cls += ' crumbling';
        }
      } else if (v === 1 || v === 2) {
        const anchored = anchors.has(i);
        const l = anchored ? 0 : life.get(i);
        let sc = 'stone p' + v + sh(v);
        const came = slide.get(i);
        if (came !== undefined) {
          const n2 = st.n;
          sc += ' slide';
          style = ' style="--dx: ' + ((came % n2) - (i % n2)) + '; --dy: ' + (((came / n2) | 0) - ((i / n2) | 0)) + '"';
        } else if (fresh.has(i)) sc += ' pop';
        if (l === 1) { sc += ' fragile'; cls += ' frag'; } else if (l === 2) sc += ' worn';
        inner = '<span class="' + sc + '"' + style + '></span>';
        if (anchored) { cls += ' anchored a' + v; inner += '<span class="badge">∞</span>'; }
        else if (l && l <= 3) inner += '<span class="badge">' + l + '</span>';
        if (winSet.has(i)) cls += ' win-p' + v;
        if (st.last.includes(i)) cls += ' last';
      } else {
        cls += ' empty';
        const sc = scars.get(i);
        if (sc) cls += ' scar s' + sc;
        const van = fx.gone.find((x) => x[0] === i);
        if (van) inner = '<span class="stone p' + van[1] + sh(van[1]) + ' vanish"></span>';
      }
      if (human && ui.sel === i && p) {
        cls += ' selected';
        if (aim(ui.action)) inner += '<span class="aim"></span>';
        else if (v === 0) inner += '<span class="stone p' + p + sh(p) + ' ghost"></span>';
        if (sign(ui.action)) inner += '<span class="badge mark">∞</span>';
      }
      if (intent && intent.i === i) {
        cls += ' intent';
        if (aim(intent.kind)) inner += '<span class="aim"></span>';
        else if (v === 0) inner += '<span class="stone p' + me + sh(me) + ' ghost"></span>';
        if (sign(intent.kind)) inner += '<span class="badge mark">∞</span>';
      }
      if (pend && pend.i === i) {
        cls += ' pending';
        if (aim(pend.kind)) inner += '<span class="aim soft"></span>';
        else if (v === 0) inner += '<span class="stone p' + me + sh(me) + ' ghost"></span>';
        if (sign(pend.kind)) inner += '<span class="badge mark">∞</span>';
      }
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
    const actWord = ACT_WORD[ui.action] || 'Сделать ход';
    const pickHint = 'Клетка выбрана. Нажмите «' + actWord + '» или выберите другую.';
    const moveHint = 'Выберите соседнюю клетку: пустую или со стеной — якорь её проломит.';
    const anchorHint = 'Выберите пустую клетку или свою фишку на поле — она станет якорем.';
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
        if (seatDone(me)) {
          const where = hasPlain(st) && hasCell(O.plain.i) ? ' на ' + cellName(st, O.plain.i) : '';
          return theirs ? 'Открываем ходы…' : 'Ваш ход' + where + ' принят и спрятан. Ждём соперника.';
        }
        if (ui.sel !== null) return pickHint;
        if (ui.action === 'shot') return shotHint;
        if (ui.action === 'moveAnchor') return moveHint;
        if (ui.action === 'anchor') return anchorHint;
        if (moveCurrent(O.moves[me], st)) return 'Ход потерялся после перезагрузки. Выберите его заново.';
        return theirs ? 'Соперник уже сходил. Ваш ход.' : 'Выберите клетку. Соперник ходит одновременно с вами.';
      }
      if (st.turn !== me) return 'Ход соперника.';
      if (ui.sel !== null) return pickHint;
      if (ui.action === 'shot') return shotHint;
      if (ui.action === 'moveAnchor') return moveHint;
      if (ui.action === 'anchor') return anchorHint;
      return 'Ваш ход.';
    }
    if (busy) return 'Бот думает…';
    if (cfg.secret && Lc.phase === 'handoff') return 'Ход Игрока 1 спрятан.';
    if (ui.sel !== null) return pickHint;
    if (ui.action === 'shot') return shotHint;
    if (ui.action === 'moveAnchor') return moveHint;
    if (ui.action === 'anchor') return anchorHint;
    if (cfg.secret) {
      if (Lc.phase === 'pick1') return S.opp === 'bot' ? 'Выберите клетку. Бот ходит одновременно и не видит ваш выбор.' : 'Игрок 1 выбирает ход. Игрок 2, не смотрите.';
      return 'Игрок 2 выбирает ход. Игрок 1, не смотрите.';
    }
    return S.opp === 'bot' ? 'Ваш ход.' : 'Ход: ' + names()[st.turn] + '.';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function sparks() {
    let out = '<span class="sparks" aria-hidden="true">';
    for (let k = 0; k < 14; k++) {
      const a = (360 / 14) * k + (Math.random() * 14 - 7);
      const d = 70 + Math.random() * 80;
      out += '<i style="--a:' + a.toFixed(1) + 'deg; --d:' + d.toFixed(0) + 'px; --t:' + (Math.random() * 0.22).toFixed(2) + 's"></i>';
    }
    return out + '</span>';
  }
  const resultKey = (st) => (online() ? O.code : 'local') + ':' + st.gameNo;
  // Счёт партии кружками: заполнённые — взятые раунды, пустые — сколько ещё нужно.
  function scoreDots(p, score) {
    const won = Math.min(score[p] || 0, MATCH_WINS);
    let out = '<span class="dots p' + p + '" title="Выиграно раундов: ' + (score[p] || 0) + ' из ' + MATCH_WINS + '">';
    for (let k = 0; k < MATCH_WINS; k++) out += '<i' + (k < won ? ' class="on"' : '') + '></i>';
    return out + '</span>';
  }

  function renderCover() {
    let html = '';
    const g = O.game, me = mySeat();
    const st = curSt();
    const cover0 = $('cover');
    cover0.classList.remove('finish');
    if (st && st.over && O.hideResult !== resultKey(st)) {
      const w = st.winner;
      // «Вы» есть только там, где за устройством один игрок: вдвоём на одном зовём по именам.
      const mine = online() ? me : S.opp === 'bot' ? 1 : 0;
      const score = curScore();
      const mw = matchWin(score);
      const kind = !(mw || w) ? 'draw' : (mw || w) === mine ? 'won' : 'lost';
      const canAgain = !online() || !!me;
      const head = mw
        ? mw === mine ? 'Партия за вами' : 'Партию забирает ' + names()[mw]
        : resultText(w, st.winReason);
      cover0.classList.add('finish');
      html = '<div class="result ' + kind + ((mw || w) ? ' w' + (mw || w) : '') + '">' +
        ((mw || w) ? sparks() : '') +
        '<h2>' + esc(head) + '</h2>' +
        (mw ? '<p class="sub-result">' + esc(resultText(w, st.winReason)) + '</p>' : '') +
        '<p class="tally">' + scoreDots(1, score) + '<b>' + score[1] + ' : ' + score[2] + '</b>' + scoreDots(2, score) + '</p>' +
        (score.d ? '<p class="small">Ничейных раундов: ' + score.d + ' — они не засчитываются.</p>' : '') +
        (canAgain ? '<button class="btn primary" type="button" data-act="again">' + (mw ? 'Новая партия' : 'Следующий раунд') + '</button>' : '') +
        '<button class="linkbtn" type="button" data-act="see-board">Посмотреть поле</button>' +
      '</div>';
    } else if (!online() && Lc.cfg && Lc.cfg.secret && Lc.phase === 'handoff') {
      html = '<h2>Ход Игрока 1 спрятан</h2><p>Передайте устройство Игроку 2. Он выберет ход, не зная, что сделал первый.</p>' +
        '<button class="btn primary" type="button" data-act="reveal">Я Игрок 2, показать поле</button>' +
        '<button class="linkbtn" type="button" data-act="redo">Игрок 1 хочет выбрать заново</button>';
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
  function info(title, sub, extra) {
    const d = document.createElement('div'); d.className = 'gi';
    const b = document.createElement('b'); b.textContent = title;
    const s = document.createElement('span'); s.textContent = sub;
    d.append(b, s);
    if (extra) { const e = document.createElement('span'); e.className = 'when'; e.textContent = extra; d.appendChild(e); }
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
      row.append(info(nameOf(g.p1) + ' зовёт сыграть', cfgSummary(g.cfg), fmtWhen(g.updated_at)),
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
      const fresh = (g.round || 1) === 1 && (g.moves || 0) === 0 && !g.over;
      // Из идущей партии можно выйти только сдачей, остальные удаляются насовсем.
      if (!g.over && g.p2 && !fresh) {
        const sureQ = O.confirmQuit === g.code;
        actions.push(btn(sureQ ? 'Точно сдаться?' : 'Сдаться', { act: 'ask-quit', code: g.code }, 'warn'));
      }
      if (host || fresh || g.over) {
        const sure = O.confirmDelete === g.code;
        actions.push(btn(sure ? 'Точно удалить?' : 'Удалить', { act: 'ask-delete', code: g.code }, 'warn'));
      }
      row.append(info(gameState(g), g.code + ' · ' + cfgSummary(g.cfg), fmtWhen(g.updated_at)), btns(...actions));
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
    if (S.palette === 'classic') el.removeAttribute('data-palette');
    else el.setAttribute('data-palette', S.palette);
  }

  // Куда игрока пускать: без входа — только на страницу входа, без ника — только в профиль.
  function routeGuard() {
    if (!signedIn()) { R.route = 'auth'; return; }
    if (R.route === 'auth') R.route = 'play';
    if (R.route === 'game' && !O.code) R.route = 'online';
    if (!O.myId && !['play', 'look', 'rules', 'archive'].includes(R.route)) R.route = 'play';
    if (O.myId && O.profile !== undefined && (!O.profile || !NICK_RE.test(O.profile.nickname))) R.route = 'profile';
  }

  function renderSound() {
    const btn = $('soundBtn'), range = $('volume');
    const on = !!S.sound && S.volume > 0;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Выключить звук' : 'Включить звук';
    if (document.activeElement !== range) range.value = String(S.volume);
    range.style.setProperty('--fill', S.volume + '%');
  }

  // Палитра тянет за собой пару цветов фишек: мы советуем сочетание, но его можно переиграть.
  function applyPair(id) {
    const pal = PALETTES.find((x) => x.id === id);
    if (!pal || !pal.pair) return;
    S.look[1].color = pal.pair[0];
    S.look[2].color = pal.pair[1];
  }

  function renderPalettes() {
    const host = $('palettes');
    const key = S.palette;
    if (host.dataset.key === key) return;
    if (!host.children.length) {
      host.innerHTML = PALETTES.map((p) =>
        '<button type="button" class="pal" data-pal="' + p.id + '"><i style="--a: ' + p.a + '; --b: ' + p.b + '"></i>' + p.name + '</button>'
      ).join('');
    }
    host.dataset.key = key;
    host.querySelectorAll('.pal').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.pal === key ? 'true' : 'false');
    });
  }

  function renderNav(route) {
    const tab = route === 'game' ? 'online' : route;
    $('appbar').hidden = route === 'auth';
    document.querySelector('.help').setAttribute('aria-pressed', route === 'rules' ? 'true' : 'false');
    document.querySelector('.hist').setAttribute('aria-pressed', route === 'archive' ? 'true' : 'false');
    document.querySelectorAll('#tabs .tab').forEach((b) => {
      const nav = b.dataset.nav;
      b.hidden = !O.myId && (nav === 'online' || nav === 'profile' || nav === 'top');
      if (nav === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const waiting = O.friends.filter((f) => f.status === 'in').length + O.invites.length;
    const count = $('navCount');
    count.hidden = !waiting;
    count.textContent = waiting || '';
    $('meNickTop').textContent = O.profile ? O.profile.nickname : O.guest ? 'Гость' : '';
  }

  // Страница правил подстраивается под то, что выбрано в текущей партии.
  function renderRules() {
    const cfg = curCfg() || S;
    $('docRow').textContent = E.rowLen(cfg) === 4 ? 'четыре фишки' : 'пять фишек';
    $('docAnchors').textContent = E.ANCHORS === 2 ? 'два' : String(E.ANCHORS);
    $('docRange').textContent = E.MAGNET_RANGE + ' ' + plural(E.MAGNET_RANGE, 'клетку', 'клетки', 'клеток');
    $('docHold').textContent = String(E.ANCHOR_HOLD);
    $('docMiss').textContent = E.MISS_LIMIT + ' пропуска подряд';
  }

  // Правила партии нужны и на экране игры, и в лобби: карточка одна и переезжает.
  function placeRules(route) {
    const card = $('rulesCard');
    const slot = $(route === 'online' ? 'rulesSlotOnline' : 'rulesSlotPlay');
    if (card.parentElement !== slot) { slot.appendChild(card); card.open = route === 'online' || !!S.rulesOpen; }
    $('rulesTitle').textContent = route === 'online' ? 'Правила новой партии' : 'Правила партии';
    // Фишки настраиваются и в разделе «Вид», и прямо по ходу партии.
    const looks = $('looksCard');
    const lslot = $(route === 'look' ? 'looksSlotLook' : 'looksSlotPlay');
    // Рядом с полем карточка не должна мозолить глаза: там она свёрнута.
    if (looks.parentElement !== lslot) { lslot.appendChild(looks); looks.open = route === 'look'; }
  }

  function render() {
    applyTheme();
    applyLook();
    routeGuard();
    const route = R.route;
    $('screenAuth').hidden = route !== 'auth';
    $('screenPlay').hidden = !(route === 'play' || route === 'game');
    $('screenOnline').hidden = route !== 'online';
    $('screenTop').hidden = route !== 'top';
    $('screenLook').hidden = route !== 'look';
    $('screenRules').hidden = route !== 'rules';
    $('screenArchive').hidden = route !== 'archive';
    $('screenProfile').hidden = route !== 'profile';
    renderNav(route);
    renderSound();
    placeRules(route);
    if (route === 'auth') { renderAuth(); return; }
    renderSettings();
    renderLooks();
    renderPalettes();
    $('backLive').hidden = !Lc.saved;
    if (route === 'rules') { renderRules(); return; }
    if (route === 'archive') { renderArchive(); return; }
    if (route === 'online') { renderHome(); return; }
    if (route === 'top') { renderTop(); return; }
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
    $('logPanel').open = !!S.logOpen;
    $('boardWrap').hidden = !st;
    $('actions').hidden = !st;
    $('players').hidden = !st;
    $('logPanel').hidden = !st;
    $('tools').hidden = true;
    const msg = $('msg');
    msg.textContent = isOnline ? O.msg : '';
    msg.hidden = !msg.textContent;
    if (!st) {
      $('round').textContent = 'Партия';
      $('clock').hidden = true;
      $('cancelMove').hidden = true;
      $('statusText').className = '';
      $('statusText').textContent = O.notFound
        ? 'Партия ' + O.code + ' не найдена. Возможно, её удалили или у вас нет к ней доступа.'
        : 'Загружаем партию…';
      return;
    }

    const all = frames(st);
    const frame = viewFrame(st);
    $('rewind').hidden = all.length < 2;
    if (all.length > 1) {
      const at = ui.view < 0 ? all.length - 1 : ui.view;
      $('rewindAt').textContent = frame ? (frame.t || '') + ' · ' + (at + 1) + '/' + all.length : 'сейчас';
      $('stepBack').disabled = at <= 0;
      $('stepFwd').disabled = ui.view < 0;
      $('stepLive').hidden = ui.view < 0;
    }
    const p = frame ? 0 : picker();
    const human = !frame && !!p && isHuman(p) && !busy;
    if (frame) renderFrame(st, frame);
    else renderBoard(st, cfg, p, human);
    renderCover();

    $('round').textContent = 'Ход ' + (cfg.secret ? st.round : st.moves + (st.over ? 0 : 1));
    const stEl = $('statusText');
    stEl.className = st.over && st.winner ? 'win' + st.winner : '';
    stEl.textContent = statusText(st, cfg);

    const showShot = cfg.shots > 0, showAnchor = E.anchorOn(cfg);
    const onBoard = showAnchor && E.anchorOf(st, p) >= 0;
    $('tools').hidden = !(human && !st.over && (showShot || showAnchor));
    if (human) {
      $('actPlace').hidden = !showShot;
      $('actShot').hidden = !showShot;
      $('actPlace').setAttribute('aria-pressed', ui.action === 'place' ? 'true' : 'false');
      $('actShot').setAttribute('aria-pressed', ui.action === 'shot' ? 'true' : 'false');
      $('actShot').textContent = 'Выстрел · ' + st.shots[p];
      $('actShot').disabled = !E.canShoot(st, cfg, p);
      const put = $('actAnchor');
      put.hidden = !showAnchor || !E.canAnchor(st, cfg, p);
      if (!put.hidden) {
        put.textContent = 'Якорь · ' + st.anchorLeft[p];
        put.disabled = false;
        put.setAttribute('aria-pressed', ui.action === 'anchor' ? 'true' : 'false');
      }
      const mine = showAnchor ? E.anchorsOf(st, p) : [];
      const move = $('actMove');
      move.hidden = !mine.length;
      if (mine.length) {
        move.disabled = ui.take >= 0;
        move.setAttribute('aria-pressed', ui.action === 'moveAnchor' ? 'true' : 'false');
      }
      const magnet = $('actMagnet');
      const canPull = mine.length && E.canMagnet(st, cfg, p);
      magnet.hidden = !mine.length;
      if (mine.length) {
        magnet.disabled = !canPull;
        magnet.setAttribute('aria-pressed', ui.action === 'magnet' ? 'true' : 'false');
      }
      const take = $('actTake');
      take.hidden = !mine.length;
      if (mine.length) {
        // Показываем, сколько ждать ближайшему якорю, который ещё не созрел.
        const ripe = E.ripeAnchor(st, cfg, p);
        const wait = Math.min.apply(null, mine.map((a) => E.ANCHOR_HOLD - E.anchorAge(st, cfg, a)));
        take.textContent = ripe >= 0 ? 'Забрать якорь' : 'Забрать якорь · через ' + Math.max(1, wait);
        take.disabled = ripe < 0 || ui.action === 'moveAnchor';
        take.setAttribute('aria-pressed', ui.take >= 0 ? 'true' : 'false');
      }
    }

    const cbtn = $('confirm');
    if (hold) {
      cbtn.hidden = false;
      cbtn.disabled = false;
      cbtn.className = 'btn go';
      cbtn.textContent = 'Подтвердить · ' + Math.max(1, Math.ceil((hold.until - Date.now()) / 1000));
      const back = $('cancelMove');
      back.hidden = false;
      back.className = 'btn no';
      back.textContent = 'Отмена';
      $('actions').classList.add('pair');
      $('tools').hidden = true;
      renderBoard(st, cfg, 0, false);
      tickTimer();
      return;
    }
    cbtn.className = 'btn primary';
    $('cancelMove').className = 'btn ghost';
    $('actions').classList.remove('pair');
    const waiting = canCancel();
    if (st.over) {
      cbtn.textContent = matchWin(curScore()) ? 'Новая партия' : 'Следующий раунд';
      cbtn.disabled = isOnline && !mySeat();
    } else {
      cbtn.textContent = ACT_WORD[ui.action] || 'Сделать ход';
      cbtn.disabled = !(ui.sel !== null && human);
    }
    // Пока открыта ширма с итогом, вторая такая же кнопка под доской лишняя.
    const onCover = st.over && O.hideResult !== resultKey(st);
    cbtn.hidden = waiting || onCover;
    const back = $('cancelMove');
    back.hidden = !waiting;
    back.textContent = 'Отменить ход';
    $('newGame').hidden = st.over;
    const fresh = notStarted(st);
    const canResign = !st.over && !fresh && (isOnline ? !!mySeat() && !!O.game.p2 : true);
    const rbtn = isOnline ? $('resignOnline') : $('resignBtn');
    const other = isOnline ? $('resignBtn') : $('resignOnline');
    other.hidden = true;
    rbtn.hidden = !canResign;
    rbtn.textContent = O.confirmResign ? 'Точно сдаться?' : 'Сдаться';
    const cancel = $('cancelGame');
    cancel.hidden = !(isOnline && fresh && !!mySeat());
    cancel.textContent = O.confirmDelete === O.code ? 'Точно отменить?' : 'Отменить партию';
    tickTimer();

    const score = curScore();
    for (const pl of [1, 2]) {
      renderCard(pl, st, cfg, isOnline, score);
      let active;
      if (st.over) active = st.winner === pl;
      else if (isOnline) active = !!O.game.p2 && (cfg.secret ? !seatDone(pl) : st.turn === pl);
      else active = cfg.secret ? Lc.phase === 'pick' + pl : st.turn === pl;
      $('card' + pl).classList.toggle('active', active);
    }

    renderLog(st);
  }

  // Карточка игрока — одна строка: кто, его место, запасы и счёт побед.
  const ICONS = {
    shot: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.6"/></svg>',
    anchor: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3" r="2"/><path d="M8 5v9M4 9c0 3 2 5 4 5s4-2 4-5M4.5 8.5h7"/></svg>',
    clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/></svg>',
    pair: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="8" r="2.6"/><circle cx="10.5" cy="8" r="2.6"/></svg>',
    miss: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
  };
  // Место в таблице лидеров: первая тройка получает свой цвет.
  function placeOf(uid) {
    if (!uid || !O.top.length) return 0;
    const k = O.top.findIndex((r) => r.id === uid);
    return k >= 0 && k < 3 ? k + 1 : 0;
  }

  function renderCard(p, st, cfg, isOnline, score) {
    const host = $('card' + p);
    const nm = names()[p];
    const uid = isOnline && O.game ? (p === 1 ? O.game.p1 : O.game.p2) : null;
    const elo = uid ? O.ratings[uid] : null;
    const place = uid ? placeOf(uid) : 0;
    const bits = [];
    const add = (icon, text, title, off) =>
      bits.push('<span class="bit' + (off ? ' off' : '') + '" title="' + esc(title) + '">' + ICONS[icon] + '<b>' + esc(text) + '</b></span>');
    if (cfg.shots) add('shot', String(st.shots[p]), 'Выстрелы: ' + st.shots[p] + ' из ' + cfg.shots, !st.shots[p]);
    if (E.anchorOn(cfg)) {
      const on = E.anchorsOf(st, p);
      const where = on.length ? on.map((i) => cellName(st, i)).join(', ') : 'нет на поле';
      // Якорей всегда двое: на доске и в запасе вместе. Показываем «на доске из всех».
      const all = on.length + (st.anchorLeft[p] || 0);
      add('anchor', on.length + '/' + all, 'Якорей на доске: ' + on.length + ' из ' + all + ' (' + where + ')', !on.length);
    }
    if (cfg.bank && st.bank) {
      const left = st.bank[p] || 0;
      add('clock', fmtSpan(left), 'Запас времени', left <= 10);
    }
    if (cfg.capture) add('pair', st.caps[p] + '/5', 'Захвачено пар', !st.caps[p]);
    if (st.misses && st.misses[p]) add('miss', st.misses[p] + '/' + E.MISS_LIMIT, 'Пропущено ходов подряд');
    const turn = isOnline && cfg.secret && !st.over && O.game && O.game.p2 && seatDone(p);

    const key = JSON.stringify([nm, elo, place, lookOf(p), bits, score[p], score.d, turn]);
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.className = 'pcard p' + p + (place ? ' medal m' + place : '');
    host.innerHTML =
      '<span class="ico"><span class="stone p' + p + ' sh-' + lookOf(p).shape + '"></span></span>' +
      '<span class="nm">' + esc(nm) + '</span>' +
      (elo ? '<span class="elo"' + (place ? ' title="' + place + '-е место в таблице лидеров"' : '') + '>' + elo + '</span>' : '') +
      (turn ? '<span class="done" title="Ход сделан">✓</span>' : '') +
      scoreDots(p, score) +
      '<span class="bits">' + bits.join('') + '</span>';
  }

  function renderTop() {
    setNote($('topNote'), O.topMsg, true);
    const host = $('leaders');
    host.innerHTML = '';
    if (!O.top.length) { emptyLine(host, 'Пока никто не сыграл ни одной сетевой партии.'); return; }
    O.top.forEach((r, k) => {
      const row = li(r.id === O.myId ? 'me' : '');
      const place = document.createElement('span'); place.className = 'place'; place.textContent = '#' + (k + 1);
      const who = document.createElement('span'); who.className = 'who-name'; who.textContent = r.nickname;
      const score = document.createElement('span'); score.className = 'score';
      const w = r.wins || 0, l = r.losses || 0, d = r.draws || 0;
      score.textContent = w + ' ' + plural(w, 'победа', 'победы', 'побед')
        + ' · ' + l + ' ' + plural(l, 'поражение', 'поражения', 'поражений')
        + ' · ' + d + ' ' + plural(d, 'ничья', 'ничьи', 'ничьих');
      const elo = document.createElement('span'); elo.className = 'elo'; elo.textContent = r.rating;
      row.append(place, who, score, elo);
      host.appendChild(row);
    });
  }

  function renderSettings() {
    const st = curSt();
    // Правила меняют до первого хода и после партии: посреди неё они зафиксированы.
    const playing = !!st && !st.over && !notStarted(st);
    const locked = R.route !== 'online' && (playing || (online() && !!O.game && !st.over));
    // В идущей партии показываем её правила, иначе — выбранные для следующей.
    const src = online() && O.game ? O.game.cfg : locked && Lc.cfg ? Lc.cfg : S;
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
    dim('set-bank', !src.timer || locked);
    ['set-size', 'set-win', 'set-secret', 'set-mem', 'set-shots', 'set-capture', 'set-timer'].forEach((id) => $(id).classList.toggle('dim', locked));
    $('rulesCard').classList.toggle('locked', locked);
    $('rulesBrief').textContent = cfgSummary(src);
    $('rulesNote').textContent = locked
      ? cfgSummary(src) + '. ' + (online() ? 'Правила выбрал создатель партии.' : 'Партия идёт: правила можно будет поменять после неё.')
      : R.route === 'online' ? 'Эти правила получит партия, которую вы создадите.'
      : st && st.over ? 'Эти правила получит следующий раунд — нажмите кнопку под полем.'
      : 'Смена правил сразу начинает новую партию.';
  }

  function renderLooks() {
    // Слот 1 — свои фишки, слот 2 — соперника. Соперник у себя видит собственный выбор.
    const isOnline = inOnlineGame();
    let labels;
    if (isOnline) {
      const foeId = mySeat() === 1 ? O.game.p2 : O.game.p1;
      const foe = foeId ? nameOf(foeId) : '';
      labels = { 1: 'Ваши фишки', 2: foe && foe !== 'Игрок' ? 'Фишки: ' + foe : 'Фишки соперника' };
    } else {
      const nm = names();
      // В настройках соперник — просто «противник»: бот он или живой игрок, тут не важно.
      labels = { 1: nm[1], 2: S.opp === 'bot' ? 'Противник' : nm[2] };
    }
    const blocks = [{ slot: 1, label: labels[1], look: S.look[1] }, { slot: 2, label: labels[2], look: S.look[2] }];
    const pal = PALETTES.find((x) => x.id === S.palette) || PALETTES[0];
    const key = JSON.stringify([blocks, pal.id]);
    const host = $('looks');
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.innerHTML = blocks.map((bk) =>
      '<div class="look" data-slot="' + bk.slot + '">' +
        '<span class="look-name"></span>' +
        '<div class="swatches" role="group" aria-label="Цвет">' +
          COLORS.map((c) => {
            const rec = pal.pair && pal.pair[bk.slot - 1] === c.id;
            const title = c.name + (rec ? ' · советуем к палитре «' + pal.name + '»' : '');
            return '<button type="button" class="swatch' + (rec ? ' rec' : '') + '" data-color="' + c.id + '" style="--sw: var(--c-' + c.id + ')" title="' + title + '" aria-label="' + title + '" aria-pressed="' + (bk.look.color === c.id) + '"></button>';
          }).join('') +
        '</div>' +
        '<div class="shapes" role="group" aria-label="Фигура">' +
          SHAPES.map((s) => '<button type="button" class="shp" data-shape="' + s.id + '" title="' + s.name + '" aria-label="' + s.name + '" aria-pressed="' + (bk.look.shape === s.id) + '"><span class="stone sh-' + s.id + '" style="--pc: var(--c-' + bk.look.color + ')"></span></button>').join('') +
        '</div>' +
      '</div>'
    ).join('');
    host.querySelectorAll('.look-name').forEach((el, k) => { el.textContent = blocks[k].label; });
  }

  // ---------- Events ----------
  $('looks').addEventListener('click', (e) => {
    const box = e.target.closest('.look');
    const sw = e.target.closest('.swatch'), shp = e.target.closest('.shp');
    if (!box || (!sw && !shp)) return;
    const slot = +box.dataset.slot, other = 3 - slot;
    if (sw) {
      const c = sw.dataset.color;
      // Цвета не должны совпадать: занятый цвет уезжает в соседний слот.
      if (S.look[other].color === c) S.look[other].color = S.look[slot].color;
      S.look[slot].color = c;
    } else S.look[slot].shape = shp.dataset.shape;
    save();
    render();
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
      if (key === 'sound') { if (val) SFX.join(); render(); return; }
      if (key === 'opp') { Lc.starter = 2; newLocal(); return; }
      // Правила: до первого хода перезапускают раунд, после него — ждут кнопки под полем.
      if (R.route !== 'play') { render(); return; }
      if (Lc.st && Lc.st.over) { render(); return; }
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
    else if (act === 'help') go('rules');
    else if (act === 'archive') go('archive');
    else if (act === 'rules-back') go(O.code ? 'game' : 'play');
    else if (act === 'reveal' && Lc.phase === 'handoff') { Lc.phase = 'pick2'; render(); }
    else if (act === 'again') confirmMove();
    else if (act === 'see-board') { const st = curSt(); if (st) { O.hideResult = resultKey(st); render(); } }
    else if (act === 'redo' && Lc.phase === 'handoff') { Lc.phase = 'pick1'; Lc.pending1 = null; resetUi(); render(); }
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
    else if (act === 'ask-delete') askDelete(t.dataset.code || O.code);
    else if (act === 'ask-quit') askQuit(t.dataset.code);
    else if (act === 'replay') openArchive(t.dataset.id);
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
  $('toLobby').addEventListener('click', () => { closeGame(); go('online'); });
  $('stepBack').addEventListener('click', () => stepView(-1));
  $('stepFwd').addEventListener('click', () => stepView(1));
  $('stepLive').addEventListener('click', () => { ui.view = -1; render(); });
  $('backLive').addEventListener('click', closeArchive);
  $('confirm').addEventListener('click', () => { if (hold) sendHoldNow(); else confirmMove(); });
  $('cancelMove').addEventListener('click', () => { if (hold) dropHold(); else cancelMove(); });
  $('newGame').addEventListener('click', () => { if (!online()) newLocal(); });
  $('actPlace').addEventListener('click', () => setAction('place'));
  $('actShot').addEventListener('click', () => setAction(ui.action === 'shot' ? 'place' : 'shot'));
  $('actTake').addEventListener('click', () => {
    const st = curSt(), cfg = curCfg(), p = picker();
    // Возврат якоря не стоит хода: это отметка к ходу, а не сам ход.
    if (!st || !p || !isHuman(p) || busy) return;
    if (ui.take >= 0) { ui.take = -1; render(); return; }
    const ripe = E.ripeAnchor(st, cfg, p);
    if (ripe < 0) return;
    ui.take = ripe;
    if (ui.action === 'moveAnchor') setAction('place'); else render();
  });
  $('actMagnet').addEventListener('click', () => setAction(ui.action === 'magnet' ? 'place' : 'magnet'));
  $('actMove').addEventListener('click', () => setAction(ui.action === 'moveAnchor' ? 'place' : 'moveAnchor'));
  $('resignBtn').addEventListener('click', resign);
  $('resignOnline').addEventListener('click', resign);
  $('moreLocal').addEventListener('click', () => {
    const box = $('drawer');
    box.hidden = !box.hidden;
    $('moreLocal').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
  });
  $('soundBtn').addEventListener('click', () => {
    if (S.sound && S.volume > 0) S.sound = false;
    else { S.sound = true; if (!S.volume) S.volume = 70; SFX.move(); }
    save();
    render();
  });
  $('volume').addEventListener('input', () => {
    S.volume = Math.max(0, Math.min(100, Number($('volume').value) || 0));
    if (S.volume > 0) S.sound = true;
    renderSound();
  });
  $('volume').addEventListener('change', () => { save(); if (S.volume) SFX.move(); });
  $('palettes').addEventListener('click', (e) => {
    const b = e.target.closest('.pal');
    if (!b || b.dataset.pal === S.palette) return;
    S.palette = b.dataset.pal;
    applyPair(S.palette);
    save();
    render();
  });
  $('cancelGame').addEventListener('click', () => askDelete(O.code));
  $('logPanel').addEventListener('toggle', () => { S.logOpen = $('logPanel').open; save(); });
  $('rulesCard').addEventListener('toggle', () => {
    if (R.route === 'online') return;
    S.rulesOpen = $('rulesCard').open;
    save();
  });
  $('actAnchor').addEventListener('click', () => setAction(ui.action === 'anchor' ? 'place' : 'anchor'));

  // ---------- Start ----------
  setInterval(tickTimer, 250);
  applyTheme();
  Lc.starter = 2;
  Lc.cfg = pickCfg(S);
  Lc.st = E.make(Lc.cfg, 1, 1);
  Lc.phase = Lc.cfg.secret ? 'pick1' : 'pick';
  render();
  initAuth();
})();
