/** 生成一张示例行李图截图，人工检查图像效果 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url === '/' || req.url?.startsWith('/?') ? '/index.html' : (req.url ?? '/').split('?')[0];
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on('console', (msg) => console.log(`[browser] ${msg.text()}`));
await page.goto(`http://127.0.0.1:${port}/?shot=1`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
const canvas = await page.$('canvas');
await canvas.screenshot({ path: fileURLToPath(new URL('../demo-xray.png', import.meta.url)) });
await browser.close();
server.close();
console.log('已保存 demo-xray.png');
