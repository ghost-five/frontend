// Маленький драйвер Chrome по CDP: запустить, открыть вкладку, выполнить JS, снять экран.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Снимки складываем в tools/shots, чтобы не сорить в папке игры.
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');

export async function launch(port = 9222) {
  const dir = mkdtempSync(join(tmpdir(), 'ghost-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
    '--hide-scrollbars', '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { await r.json(); return { proc, port }; }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome не поднялся');
}

export async function newTab(port, url = 'about:blank') {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const t = await r.json();
  return connect(t.webSocketDebuggerUrl);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  const events = [];
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const { res, rej } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) events.push(m);
  };
  const send = async (method, params = {}) => {
    await ready;
    const mid = ++id;
    return new Promise((res, rej) => { waiting.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
  };
  return {
    send, events,
    close: () => ws.close(),
    async goto(url) {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 600));
    },
    async eval(expr, awaitPromise = false) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'ошибка в JS');
      return r.result.value;
    },
    async screenshot(path, full = false) {
      const out = isAbsolute(path) ? path : join(SHOTS, path);
      mkdirSync(dirname(out), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
      writeFileSync(out, Buffer.from(r.data, 'base64'));
      return out;
    },
    async size(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
    },
    async theme(scheme) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    },
    async logs() {
      return events.filter((e) => e.method === 'Runtime.consoleAPICalled' || e.method === 'Runtime.exceptionThrown');
    }
  };
}
