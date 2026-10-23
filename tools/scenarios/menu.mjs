import { launch, newTab } from '../cdp.mjs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const { proc, port } = await launch(9275);
const t = await newTab(port);
const say = (n, v) => console.log('·', n, '→', v);
await t.theme('dark'); await t.size(1280,1000);
await t.goto('http://localhost:8778/'); await t.eval("localStorage.clear()"); await t.eval("localStorage.setItem('ghost5-settings', JSON.stringify({hold:0}))");
await t.goto('http://localhost:8778/?as=1'); await wait(1600);
const rightClick = async (i) => {
  const b = JSON.parse(await t.eval(`(() => { const r = document.querySelector('.cell[data-i="${i}"]').getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()`));
  for (const type of ['mousePressed', 'mouseReleased']) {
    await t.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'right', buttons: 2, clickCount: 1 });
  }
  await wait(300);
};
const menu = async () => t.eval("document.getElementById('cellMenu').hidden ? 'скрыто' : [...document.querySelectorAll('#cellMenu button')].map(b=>b.textContent.trim()).join(' | ')");
await rightClick(45);
say('меню на пустой клетке', await menu());
say('заголовок', await t.eval("document.querySelector('#cellMenu .mhead') ? document.querySelector('#cellMenu .mhead').textContent : '-'"));
await t.screenshot('menu-dark.png');
// выбираем «Поставить фишку»
await t.eval("[...document.querySelectorAll('#cellMenu button')].find(b=>b.textContent.includes('Поставить фишку')).click()"); await wait(400);
say('после выбора', await t.eval("'меню: ' + (document.getElementById('cellMenu').hidden ? 'закрыто' : 'открыто') + ', выбрана клетка: ' + document.querySelectorAll('.cell.selected').length + ', кнопка: ' + document.getElementById('confirm').textContent"));
say('ход не отправлен', await t.eval("document.getElementById('round').textContent"));
// меню с выстрелом: сначала поставим фишки
await t.eval("document.getElementById('confirm').click()"); await wait(1000);
const foe = await t.eval("(() => { const c = [...document.querySelectorAll('.cell')].find(e => e.querySelector('.stone.p2')); return c ? +c.dataset.i : -1; })()");
say('фишка бота на клетке', foe);
if (foe >= 0) { await rightClick(foe); say('меню на фишке соперника', await menu()); }
// якорь: меню на своей фишке
const mine = await t.eval("(() => { const c = [...document.querySelectorAll('.cell')].find(e => e.querySelector('.stone.p1')); return c ? +c.dataset.i : -1; })()");
await rightClick(mine);
say('меню на своей фишке', await menu());
// закрытие по Esc
await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await wait(250);
say('Esc закрывает', await menu());
const errs = (await t.logs()).filter(e => e.method === 'Runtime.exceptionThrown');
console.log('ошибки:', errs.length ? JSON.stringify(errs.map(e=>e.params.exceptionDetails?.exception?.description)).slice(0,300) : 'нет');
proc.kill(); process.exit(0);
