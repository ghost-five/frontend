// Две вкладки на стенде: дружба, приглашение, партия с тайным ходом.
import { launch, newTab } from '../cdp.mjs';

const BASE = 'http://localhost:8778/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  window.T = {
    screen: () => [...document.querySelectorAll('.screen:not([hidden])')].map(s => s.id).join(','),
    status: () => document.getElementById('statusText').textContent,
    round: () => document.getElementById('round').textContent,
    cover: () => { const c = document.getElementById('cover'); return c.hidden ? '' : c.textContent.replace(/\\s+/g,' ').trim().slice(0,90); },
    note: (id) => { const e = document.getElementById(id); return e && !e.hidden ? e.textContent : ''; },
    list: (id) => [...document.querySelectorAll('#'+id+' li')].map(li => li.textContent.replace(/\\s+/g,' ').trim()),
    click: (sel) => { const e = document.querySelector(sel); if (!e) throw new Error('нет '+sel); e.click(); return true; },
    clickText: (sel, text) => {
      const e = [...document.querySelectorAll(sel)].find(x => x.textContent.trim().includes(text));
      if (!e) throw new Error('нет кнопки «'+text+'»'); e.click(); return true;
    },
    type: (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); return true; },
    submit: (sel) => { document.querySelector(sel).dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); return true; },
    freeCell: (k) => { const c = [...document.querySelectorAll('.cell.ok.empty')]; return c.length ? +c[Math.floor(c.length*k)].dataset.i : -1; },
    clickCell: (i) => { document.querySelector('.cell[data-i="'+i+'"]').click(); return true; },
    confirmDisabled: () => document.getElementById('confirm').disabled
  };
`;

const { proc, port } = await launch(9223);
const t1 = await newTab(port);
const t2 = await newTab(port);
const step = async (name, fn) => { try { const r = await fn(); console.log('✓', name, r === undefined ? '' : '→ ' + r); } catch (e) { console.log('✗', name, '→', e.message); } };

for (const [t, as] of [[t1, 1], [t2, 2]]) {
  await t.theme('dark');
  await t.size(1280, 900);
  if (as === 1) { await t.goto(BASE); await t.eval("localStorage.clear()"); }
  await t.goto(BASE + '?as=' + as);
  await t.eval(HELPERS);
  await wait(500);
}

await step('вкладка 1: после входа открыт раздел «Игра»', () => t1.eval('T.screen()'));
await step('вкладка 1: ник в шапке', () => t1.eval("document.getElementById('meNickTop').textContent"));
await step('вкладка 1: идёт партия с ботом', () => t1.eval('T.status()'));

await step('вкладка 1: переход в раздел «По сети»', async () => { await t1.eval("T.clickText('.tab','По сети')"); await wait(400); return t1.eval('T.screen()'); });
await step('вкладка 1: заявка в друзья «Двое»', async () => {
  await t1.eval("T.type('#friendNick','Двое')");
  await t1.eval("T.submit('#addFriendForm')");
  await wait(1200);
  return t1.eval("T.note('friendMsg') || document.getElementById('friendMsg').textContent");
});

await step('вкладка 2: входящая заявка видна', async () => { await t2.eval("T.clickText('.tab','По сети')"); await wait(600); return t2.eval("T.list('invites').join(' | ')"); });
await step('вкладка 2: счётчик на вкладке «По сети»', () => t2.eval("document.getElementById('navCount').textContent"));
await step('вкладка 2: принять заявку', async () => { await t2.eval("T.clickText('#invites button','Принять')"); await wait(600); return t2.eval("T.list('friends').join(' | ')"); });
await step('вкладка 1: друг появился', async () => { await wait(3500); return t1.eval("T.list('friends').join(' | ')"); });

await step('вкладка 1: позвать друга в партию', async () => { await t1.eval("T.clickText('#friends button','Играть')"); await wait(1500); return (await t1.eval('T.screen()')) + ' / ' + (await t1.eval('T.cover()')); });
const code = await t1.eval("document.getElementById('gbCode').textContent");
console.log('   код партии:', code);

await step('вкладка 2: приглашение в партию', async () => {
  await wait(600);
  await t2.eval("T.clickText('.tab','Игра')"); await wait(300);
  await t2.eval("T.clickText('.tab','По сети')"); await wait(1200);
  return t2.eval("T.list('invites').join(' | ')");
});
await step('вкладка 2: сесть за стол', async () => { await t2.eval("T.clickText('#invites button','Играть')"); await wait(2500); return (await t2.eval('T.screen()')) + ' / ' + (await t2.eval('T.status()')); });
await step('вкладка 1: соперник сел', async () => { await wait(1200); return t1.eval('T.status()'); });

await step('вкладка 1: ход (тайный)', async () => {
  const i = await t1.eval('T.freeCell(0.33)');
  await t1.eval('T.clickCell(' + i + ')');
  await t1.eval("T.click('#confirm')");
  await wait(1200);
  return 'клетка ' + i + ': ' + (await t1.eval('T.status()'));
});
await step('вкладка 2: видит, что соперник сходил', async () => { await wait(1000); return t2.eval('T.status()'); });
await step('вкладка 2: ответный ход', async () => {
  const i = await t2.eval('T.freeCell(0.66)');
  await t2.eval('T.clickCell(' + i + ')');
  await t2.eval("T.click('#confirm')");
  await wait(6000);
  return 'клетка ' + i + ': ' + (await t2.eval('T.round()')) + ' · ' + (await t2.eval('T.status()'));
});
await step('вкладка 1: раунд открылся', async () => { await wait(2500); return (await t1.eval('T.round()')) + ' · ' + (await t1.eval('T.status()')); });
await step('журнал партии (вкладка 1)', () => t1.eval("T.list('log').join(' | ')"));
await step('фишки на поле', () => t1.eval("document.querySelectorAll('.board .stone').length"));

// Доигрываем раунд: первый собирает четвёрку, второй ставит фишки в стороне.
const pair = async (a, b) => {
  await t1.eval('T.clickCell(' + a + ')'); await t1.eval("T.click('#confirm')"); await wait(900);
  await t2.eval('T.clickCell(' + b + ')'); await t2.eval("T.click('#confirm')"); await wait(4000);
};
const away = [150, 156, 162, 168];
for (let k = 0; k < 4; k++) await pair(40 + k, away[k]);
await wait(2500);
await step('вкладка 1: раунд доигран', () => t1.eval('T.cover()'));
await step('раунд в истории вкладки 1', () => t1.eval(`(() => {
  const h = (JSON.parse(localStorage.getItem('mockdb') || '{}').history || []);
  return h.length + ' зап.: ' + h.map((r) => r.owner + ' · ' + r.mode + ' · раунд ' + r.game_no + ' · кадров ' + r.frames.length).join(' | ');
})()`));
await step('у вкладки 2 своя запись', () => t2.eval(`(() => {
  const h = (JSON.parse(localStorage.getItem('mockdb') || '{}').history || []);
  return h.map((r) => r.owner).join(',') || 'пусто';
})()`));
await step('в разделе «История» вкладки 1', async () => {
  await t1.eval("document.querySelector('[data-act=see-board]') && document.querySelector('[data-act=see-board]').click()"); await wait(400);
  await t1.eval("T.click('[data-act=archive]')"); await wait(1200);
  return t1.eval("[...document.querySelectorAll('#archive li')].map(x => x.textContent.replace(/\\s+/g, ' ').trim()).join(' | ') || 'пусто'");
});
await t1.eval("T.clickText('.tab','По сети')"); await wait(800);

await t1.screenshot('game-dark.png');
await t2.eval("T.clickText('.tab','Вид')"); await wait(400);
await t2.screenshot('look-dark.png');
await t2.eval("T.clickText('.tab','Профиль')"); await wait(400);
await t2.screenshot('profile-dark.png');
await t1.eval("T.clickText('#onlineBar button','Все партии')"); await wait(800);
await t1.screenshot('online-dark.png');
await t1.theme('light'); await t1.eval("T.clickText('.tab','Игра')"); await wait(500);
await t1.screenshot('play-light.png');
await t1.size(390, 844, true); await wait(300);
await t1.screenshot('play-mobile.png');

const errs = [...(await t1.logs()), ...(await t2.logs())].filter((e) => e.method === 'Runtime.exceptionThrown' || (e.params?.type === 'error'));
console.log('\nОшибки в консоли:', errs.length ? errs.map((e) => JSON.stringify(e.params).slice(0, 400)) : 'нет');
proc.kill(); process.exit(0);
