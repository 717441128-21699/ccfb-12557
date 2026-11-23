/**
 * 浏览器端验收：用本机 Edge 打开 ?selftest=1，校验
 *  1) 指数衰减律与查表值偏差 ≤3%（CPU + GPU 读回）
 *  2) 40 件物品 1024×1024 渲染 ≤200ms
 * 用法：npm run build && node scripts/verify.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url === '/' || req.url?.startsWith('/?')
      ? '/index.html'
      : (req.url ?? '/').split('?')[0];
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
console.log(`静态服务器: http://127.0.0.1:${port}`);

const launchAttempts = [
  { channel: 'msedge', headless: true },
  { channel: 'msedge', headless: true, args: ['--use-angle=swiftshader'] },
  { channel: 'chrome', headless: true },
];

let result = null;
let lastError = null;
for (const opts of launchAttempts) {
  let browser;
  try {
    browser = await chromium.launch(opts);
    const page = await browser.newPage();
    page.on('console', (msg) => console.log(`[browser] ${msg.text()}`));
    await page.goto(`http://127.0.0.1:${port}/?selftest=1`);
    await page.waitForFunction(() => window.__selftest !== undefined, null, { timeout: 60000 });
    result = await page.evaluate(() => window.__selftest);
    await browser.close();
    console.log(`浏览器启动方式: ${JSON.stringify(opts)}`);
    break;
  } catch (e) {
    lastError = e;
    if (browser) await browser.close().catch(() => {});
    console.warn(`启动失败 (${JSON.stringify(opts)}): ${e.message?.split('\n')[0]}`);
  }
}
server.close();

if (!result) {
  console.error('无法启动浏览器完成自检:', lastError?.message);
  process.exit(2);
}

console.log('\n===== 自检结果 =====');
console.log(JSON.stringify(result, null, 2));

const failures = [];
if (!result.physicsCpu.pass) failures.push(`CPU 指数律偏差 ${result.physicsCpu.maxRelErr}`);
if (!result.physicsGpuPass) failures.push('GPU 渲染结果与查表值偏差 >3%');
if (!result.perf.pass) failures.push(`渲染耗时 ${result.perf.avgMs.toFixed(1)}ms > 200ms`);

if (failures.length) {
  console.error('\n验收未通过:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log(`\n验收通过：指数律偏差 ≤3%，40 件物品 ${result.perf.resolution}² 渲染平均 ${result.perf.avgMs.toFixed(1)}ms`);
