// Renders each .post section in posts.html to a 1080x1080 PNG.
// Usage: NODE_PATH=/usr/lib/node_modules node render.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 }); // 2x = crisp 2160px exports
  const file = 'file://' + path.resolve(__dirname, 'posts.html');
  await page.goto(file, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const ids = await page.$$eval('.post', els => els.map(e => e.id));
  for (const id of ids) {
    const el = await page.$('#' + id);
    const out = path.resolve(__dirname, 'posts', id + '.png');
    await el.screenshot({ path: out });
    console.log('rendered', out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
