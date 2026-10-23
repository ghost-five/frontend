// Пауза перед ходом: «Подтвердить» и «Отмена» стоят в строку, зелёная и мягко-красная.
import { launch, newTab } from '../cdp.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { proc, port } = await launch(9279);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);

await t.size(1280, 1000);
await t.goto('http://localhost:8778/');
await t.eval("localStorage.clear()");
await t.eval("localStorage.setItem('stand-hold', '3')");
await t.goto('http://localhost:8778/?as=1'); await wait(1500);

say('пауза включена', await t.eval("String(window.GHOST_CONFIG.hold)"));
await t.eval("document.querySelector('.cell.ok.empty').click()"); await wait(200);
await t.eval("document.getElementById('confirm').click()"); await wait(400);

const row = () => t.eval(`(() => {
  const a = document.getElementById('confirm'), b = document.getElementById('cancelMove');
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const fill = (e) => getComputedStyle(e).backgroundColor || getComputedStyle(e).backgroundImage;
  return JSON.stringify({ a: a.textContent, b: b.textContent, oneLine: Math.abs(ra.top - rb.top) < 2,
    aFill: getComputedStyle(a).backgroundImage.slice(0, 60), bFill: getComputedStyle(b).backgroundColor });
})()`);
say('кнопки', await row());
await t.screenshot('hold-light.png');
await t.theme('dark'); await wait(200);
await t.screenshot('hold-dark.png');
say('отмена возвращает выбор', await t.eval("(() => { document.getElementById('cancelMove').click(); return document.getElementById('confirm').textContent; })()"));
await wait(300);
say('после отмены кнопка одна', await t.eval("document.getElementById('cancelMove').hidden + ' / ' + document.getElementById('actions').className"));

const errs = (await t.logs()).filter((e) => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map((e) => e.params.exceptionDetails?.exception?.description)).slice(0, 300) : 'нет');
proc.kill(); process.exit(0);
