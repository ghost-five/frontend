import { launch, newTab } from '../cdp.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const { proc, port } = await launch(9234);
const t1 = await newTab(port), t2 = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);
const tab = (t,n) => t.eval(`[...document.querySelectorAll('.tab')].find(b=>b.textContent.includes('${n}')).click()`);
await t1.size(1280,900); await t1.goto('http://localhost:8778/'); await t1.eval("localStorage.clear()"); await t1.eval("localStorage.setItem('ghost5-settings', JSON.stringify({hold:0}))");
await t1.goto('http://localhost:8778/?as=1'); await wait(800);
await t2.size(1280,900); await t2.goto('http://localhost:8778/?as=2'); await wait(800);
// партия по ссылке
await tab(t1,'По сети'); await wait(500);
await t1.eval("document.getElementById('linkGame').click()"); await wait(1500);
const code = await t1.eval("document.getElementById('gbCode').textContent");
await tab(t2,'По сети'); await wait(600);
await t2.eval(`document.getElementById('joinCode').value='${code}'`);
await t2.eval("document.getElementById('joinForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
await wait(2500);
say('партия началась', await t2.eval("document.getElementById('statusText').textContent"));

const pick = async (t,k) => t.eval(`(() => { const c=[...document.querySelectorAll('.cell.ok.empty')]; const e=c[Math.floor(c.length*${k})]; e.click(); return +e.dataset.i; })()`);
const i1 = await pick(t1, 0.3); await wait(200);
await t1.eval("document.getElementById('confirm').click()"); await wait(1500);
say('после хода', await t1.eval("document.getElementById('statusText').textContent"));
say('кнопка отмены видна', await t1.eval("!document.getElementById('cancelMove').hidden + ', кнопка хода скрыта: ' + document.getElementById('confirm').hidden"));
say('соперник видит', await t2.eval("document.getElementById('statusText').textContent"));

await t1.eval("document.getElementById('cancelMove').click()"); await wait(1800);
say('после отмены', await t1.eval("document.getElementById('statusText').textContent"));
say('кнопка хода вернулась', await t1.eval("!document.getElementById('confirm').hidden"));
await wait(1500);
say('соперник снова ждёт', await t2.eval("document.getElementById('statusText').textContent"));

// Переходим заново и доигрываем раунд
const i2 = await pick(t1, 0.6); await wait(200);
await t1.eval("document.getElementById('confirm').click()"); await wait(1500);
say('новый выбор отправлен', 'клетка ' + i2 + ' (была ' + i1 + ')');
const i3 = await pick(t2, 0.8); await wait(200);
await t2.eval("document.getElementById('confirm').click()"); await wait(9000);
say('раунд', await t1.eval("document.getElementById('round').textContent + ', фишек ' + document.querySelectorAll('.board .stone').length"));
say('отмена после хода соперника недоступна', await t1.eval("document.getElementById('cancelMove').hidden"));
const errs = [...(await t1.logs()), ...(await t2.logs())].filter(e => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs).slice(0,400) : 'нет');
proc.kill(); process.exit(0);
