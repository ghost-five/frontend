// Два якоря: меню на якоре зовёт только магнит, памятка всплывает по наведению.
import { launch, newTab } from '../cdp.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { proc, port } = await launch(9276);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);

await t.theme('dark'); await t.size(1340, 1050);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()");
await t.eval("localStorage.setItem('ghost5-settings', JSON.stringify({ opp: 'friend', win: 4 }))");
await t.goto('http://localhost:8778/?as=1'); await wait(1500);

const click = (sel) => t.eval(`document.querySelector('${sel}').click()`);
const cell = (i) => t.eval(`document.querySelector('.cell[data-i="${i}"]').click()`);
const reveal = async () => {
  if (await t.eval("!!document.querySelector('[data-act=reveal]')")) { await click('[data-act=reveal]'); await wait(200); }
};
const go = async (a, b) => {
  await cell(a); await wait(120); await click('#confirm'); await wait(250); await reveal();
  await cell(b); await wait(120); await click('#confirm'); await wait(400);
};
const menu = (i) => t.eval(`(() => {
  const c = document.querySelector('.cell[data-i="${i}"]');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
  const box = document.getElementById('cellMenu');
  return box.hidden ? 'меню не открылось' : [...box.children].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).join(' | ');
})()`);

// Два якоря первому игроку, второй ставит фишки в стороне.
await click('#actAnchor'); await wait(150);
await go(40, 150);
await click('#actAnchor'); await wait(150);
await go(42, 156);
say('якоря первого', await t.eval("[...document.querySelectorAll('.cell.anchored')].map(e => e.dataset.i).join(',')"));
say('в карточке', await t.eval("[...document.querySelectorAll('#card1 .bit')].map(b => b.textContent).join(' ')"));

// Фишка между якорями — магниту есть что тянуть.
await go(41, 162);
say('меню на своём якоре', await menu(40));
await t.eval("document.querySelector('#cellMenu button').click()"); await wait(300);
say('тянем именно от него', await t.eval("[...document.querySelectorAll('.cell.from')].map(e => e.dataset.i).join(',')"));
say('цели магнита', await t.eval("[...document.querySelectorAll('.cell.target')].map(e => e.dataset.i).join(',')"));
say('кнопка магнита', await t.eval("document.getElementById('actMagnet').textContent"));

// Памятка по наведению.
await t.eval(`(() => {
  const c = document.querySelector('.cell[data-i="42"]');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: r.left + 5, clientY: r.top + 5 }));
})()`);
await wait(800);
say('памятка про якорь', await t.eval("(() => { const b = document.getElementById('cellTip'); return b.hidden ? 'не появилась' : b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 150); })()"));

const errs = (await t.logs()).filter((e) => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map((e) => e.params.exceptionDetails?.exception?.description)).slice(0, 300) : 'нет');
proc.kill(); process.exit(0);
