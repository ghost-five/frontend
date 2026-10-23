import { launch, newTab } from '../cdp.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const { proc, port } = await launch(9276);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);
await t.theme('dark'); await t.size(1280,1050);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()"); await t.eval("localStorage.setItem('ghost5-settings', JSON.stringify({hold:0}))");
await t.goto('http://localhost:8778/?as=1'); await wait(900);
await t.eval("[...document.querySelectorAll('.seg[data-key=opp] button')].find(b=>b.textContent.includes('Вдвоём')).click()"); await wait(400);
const cell = async i => t.eval(`(() => { const e=document.querySelector('.cell[data-i="${i}"]'); if(!e||!e.classList.contains('ok')) return false; e.click(); return true; })()`);
const reveal = async () => { if (await t.eval("!!document.querySelector('[data-act=reveal]')")) { await t.eval("document.querySelector('[data-act=reveal]').click()"); await wait(200); } };
const go = async i => { await cell(i); await wait(120); await t.eval("document.getElementById('confirm').click()"); await wait(350); };
say('якорей в запасе', await t.eval("document.getElementById('actAnchor').textContent"));
// два якоря игроку 1
await t.eval("document.getElementById('actAnchor').click()"); await wait(200);
await go(40); await reveal(); await go(150); await wait(600);
await t.eval("document.getElementById('actAnchor').click()"); await wait(200);
await go(44); await reveal(); await go(151); await wait(700);
say('навыки игрока 1', await t.eval("document.getElementById('skills1').textContent"));
say('кнопка якоря спряталась', await t.eval("document.getElementById('actAnchor').hidden"));
say('кнопки якоря', await t.eval("[...document.querySelectorAll('#tools .chip')].filter(b=>!b.hidden).map(b=>b.textContent + (b.disabled?' (нельзя)':'')).join(' | ')"));
// щит: фишка рядом с якорем не считается в память
await go(41); await reveal(); await go(152); await wait(700);
say('фишки в лимите', await t.eval("document.getElementById('skills1').textContent"));
// магнит
await t.eval("document.getElementById('actMagnet').click()"); await wait(300);
say('цели магнита подсвечены', await t.eval("document.querySelectorAll('.cell.target').length + ', якоря-источники: ' + document.querySelectorAll('.cell.from').length"));
const errs = (await t.logs()).filter(e => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map(e=>e.params.exceptionDetails?.exception?.description)).slice(0,300) : 'нет');
proc.kill(); process.exit(0);
