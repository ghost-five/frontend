import { launch, newTab } from '../cdp.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const { proc, port } = await launch(9297);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);
await t.theme('dark'); await t.size(1440,980);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()");
await t.goto('http://localhost:8778/?as=1'); await wait(1500);
// 1. две кнопки при паузе
await t.eval("(() => { const c=[...document.querySelectorAll('.cell.ok.empty')]; c[40].click(); })()"); await wait(200);
await t.eval("document.getElementById('confirm').click()"); await wait(500);
say('кнопки при паузе', await t.eval("document.getElementById('confirm').textContent + ' | ' + (document.getElementById('cancelMove').hidden ? '—' : document.getElementById('cancelMove').textContent)"));
await t.eval("document.getElementById('confirm').click()"); await wait(800);
say('подтвердили сразу', await t.eval("document.getElementById('round').textContent + ', фишек ' + document.querySelectorAll('.board .stone').length"));
// 2. правила в процессе партии
await t.eval("document.getElementById('moreLocal').click()"); await wait(400);
say('правила заблокированы', await t.eval("document.querySelector('.seg[data-key=size] button').disabled + ' · ' + document.getElementById('rulesNote').textContent"));
// 3. кнопка настроек рядом с ящиком
say('кнопка и ящик рядом', await t.eval("(() => { const b = document.getElementById('moreLocal').getBoundingClientRect(); const d = document.getElementById('drawer').getBoundingClientRect(); return Math.round(d.top - b.bottom) + 'px между ними'; })()"));
// 4. дальность магнита
await t.eval("document.querySelector('[data-act=help]').click()"); await wait(500);
say('в правилах магнит', await t.eval("document.getElementById('docRange').textContent + ' клетки'"));
await t.eval("document.querySelector('[data-act=rules-back]').click()"); await wait(400);
// 5. рамка у ползунка
await t.eval("(() => { const r = document.getElementById('volume'); const b = r.getBoundingClientRect(); return b; })()");
const box = JSON.parse(await t.eval("(() => { const b = document.getElementById('volume').getBoundingClientRect(); return JSON.stringify({x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2)}); })()"));
for (const type of ['mousePressed', 'mouseReleased']) await t.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
await wait(300);
say('после клика по ползунку', await t.eval("(() => { const r = document.getElementById('volume'); const cs = getComputedStyle(r); return 'outline: ' + cs.outlineStyle + ' ' + cs.outlineWidth + ', активный: ' + (document.activeElement === r); })()"));
const errs = (await t.logs()).filter(e => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map(e=>e.params.exceptionDetails?.exception?.description)).slice(0,300) : 'нет');
proc.kill(); process.exit(0);
