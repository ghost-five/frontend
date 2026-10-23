// Партия до двух побед: раунды, счёт кружками, кнопки «Следующий раунд» и «Новая партия».
import { launch, newTab } from '../cdp.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { proc, port } = await launch(9284);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);

await t.theme('dark'); await t.size(1340, 1000);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()");
await t.eval("localStorage.setItem('ghost5-settings', JSON.stringify({ opp: 'friend', win: 4 }))");
await t.goto('http://localhost:8778/?as=1'); await wait(900);

const cell = (i) => t.eval(`document.querySelector('.cell[data-i="${i}"]').click()`);
const confirm = () => t.eval("document.getElementById('confirm').click()");
const reveal = async () => {
  if (await t.eval("!!document.querySelector('[data-act=reveal]')")) {
    await t.eval("document.querySelector('[data-act=reveal]').click()"); await wait(200);
  }
};
const go = async (a, b) => { await cell(a); await wait(100); await confirm(); await wait(250); await reveal(); await cell(b); await wait(100); await confirm(); await wait(350); };
const dots = () => t.eval("[...document.querySelectorAll('.pcard')].map(c => c.querySelector('.nm').textContent + ' ' + [...c.querySelectorAll('.dots i')].map(i => i.className === 'on' ? '●' : '○').join('')).join(' | ')");
const cover = () => t.eval("(() => { const c = document.getElementById('cover'); return c.hidden ? '' : c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120); })()");

say('карточки над полем', await t.eval("(() => { const p = document.getElementById('players'), b = document.getElementById('boardWrap'); return p.parentElement.id + ', выше доски: ' + (p.compareDocumentPosition(b) & 4 ? 'да' : 'нет') + ', в строку: ' + (getComputedStyle(p).flexDirection === 'row'); })()"));
say('счётчик ходов', await t.eval("document.getElementById('round').textContent"));
say('счёт в начале', await dots());

// Раунд 1: первый собирает четвёрку, второй разбрасывает фишки и ряда не строит.
const away = [150, 156, 162, 168];
for (let k = 0; k < 4; k++) await go(40 + k, away[k]);
await wait(500);
say('итог раунда 1', await cover());
say('счёт после раунда 1', await dots());
say('кнопка под полем', await t.eval("document.getElementById('confirm').textContent"));

await t.eval("document.querySelector('[data-act=again]').click()"); await wait(600);
say('после «Следующий раунд»', await t.eval("document.getElementById('round').textContent + ', фишек на поле: ' + document.querySelectorAll('.cell .stone').length"));
say('счёт держится', await dots());

// Раунд 2: та же четвёрка — партия должна закончиться.
for (let k = 0; k < 4; k++) await go(40 + k, away[k]);
await wait(500);
say('итог партии', await cover());
say('счёт в конце', await dots());
await t.screenshot('match-end.png');
say('кнопка на ширме', await t.eval("document.querySelector('[data-act=again]').textContent"));

await t.eval("document.querySelector('[data-act=again]').click()"); await wait(600);
say('после «Новая партия»', await dots());

const errs = (await t.logs()).filter((e) => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map((e) => e.params.exceptionDetails?.exception?.description)).slice(0, 400) : 'нет');
proc.kill(); process.exit(0);
