import { launch, newTab } from '../cdp.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const { proc, port } = await launch(9288);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);
await t.theme('dark'); await t.size(1440,950);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()");
await t.eval("localStorage.setItem('ghost5-settings', JSON.stringify({ hold: 0, opp: 'friend' }))");
await t.goto('http://localhost:8778/?as=1'); await wait(1500);
const cell = async i => t.eval(`(() => { const e=document.querySelector('.cell[data-i="${i}"]'); if(!e||!e.classList.contains('ok')) return false; e.click(); return true; })()`);
const reveal = async () => { if (await t.eval("!!document.querySelector('[data-act=reveal]')")) { await t.eval("document.querySelector('[data-act=reveal]').click()"); await wait(200); } };
const go = async i => { await cell(i); await wait(120); await t.eval("document.getElementById('confirm').click()"); await wait(350); };
// партия до победы игрока 1
for (const [a, b] of [[30, 100], [31, 115], [32, 130], [33, 145]]) {
  await go(a); await reveal(); await go(b); await wait(500);
  if (await t.eval("document.querySelectorAll('.cell.win-p1').length") > 0) break;
}
await wait(700);
say('партия окончена', await t.eval("document.querySelector('.result h2') ? document.querySelector('.result h2').textContent : 'нет'"));
say('в архиве записей', await t.eval("JSON.parse(localStorage.getItem('ghost5-archive') || '[]').length"));
await t.eval("document.querySelector('[data-act=see-board]').click()"); await wait(300);
await t.eval("document.querySelector('[data-act=archive]').click()"); await wait(600);
say('список архива', await t.eval("[...document.querySelectorAll('#archive li')].map(x=>x.textContent.replace(/\\s+/g,' ')).join(' | ')"));
await t.eval("document.querySelector('[data-act=replay]').click()"); await wait(700);
say('режим просмотра', await t.eval("document.getElementById('rewindAt').textContent + ', кнопка возврата: ' + !document.getElementById('backLive').hidden"));
await t.eval("document.getElementById('stepFwd').click()"); await wait(400);
say('шаг вперёд', await t.eval("document.getElementById('rewindAt').textContent + ', фишек ' + document.querySelectorAll('.board .stone').length"));
await t.eval("document.getElementById('backLive').click()"); await wait(500);
say('вернулись к живой партии', await t.eval("document.getElementById('backLive').hidden + ', можно ходить: ' + (document.querySelectorAll('.cell.ok').length > 0)"));
const errs = (await t.logs()).filter(e => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map(e=>e.params.exceptionDetails?.exception?.description)).slice(0,300) : 'нет');
proc.kill(); process.exit(0);
