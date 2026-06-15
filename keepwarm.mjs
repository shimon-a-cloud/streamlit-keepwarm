// Keep one or more Streamlit Community Cloud apps awake.
//
// Why a real browser: Streamlit's sleep timer is based on real browser
// (websocket) sessions. A plain HTTP request returns 200 even while the app is
// asleep and does NOT wake it or reset the timer — so uptime pings (UptimeRobot
// etc.) cannot keep a Streamlit app warm. This opens each URL in headless
// Chromium, clicks the "Yes, get this app back up!" button if the app is
// asleep, and confirms the Streamlit session websocket opens (the signal that
// the container is live and the inactivity timer has reset).

import { chromium } from 'playwright';

const urls = (process.env.APP_URLS || '')
  .split(/[\n,]+/)
  .map((u) => u.trim())
  .filter(Boolean);

if (urls.length === 0) {
  console.error('No APP_URLS provided. Set the APP_URLS secret (newline- or comma-separated URLs).');
  process.exit(1);
}

const WAKE_BUTTON = /get this app back up/i;
// Streamlit session websocket — opening it proves the app container is live and
// the session is registered (version-independent; survives the password gate).
const STREAMLIT_WS = /_stcore\/stream|\/stream(\?|$)/;
// Fallback DOM signal if the websocket event is somehow missed.
const SHELL = '[data-testid="stApp"], .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"]';

let hadError = false;
const browser = await chromium.launch();

try {
  for (const url of urls) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let wsOpen = false;
    page.on('websocket', (ws) => {
      if (STREAMLIT_WS.test(ws.url())) {
        wsOpen = true;
        console.log(`[${url}] streamlit session websocket opened`);
      }
    });

    try {
      console.log(`\n[${url}] visiting...`);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // The sleep interstitial and the live app are both JS-rendered, so wait
      // for the wake button or the app shell (or a short grace) before acting.
      const wakeButton = page.getByRole('button', { name: WAKE_BUTTON });
      const shell = page.locator(SHELL).first();
      await Promise.race([
        wakeButton.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
        shell.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
        page.waitForTimeout(15000),
      ]);

      if (await wakeButton.isVisible().catch(() => false)) {
        console.log(`[${url}] app was asleep — clicking wake button...`);
        await wakeButton.click().catch(() => {});
      }

      // Success = the Streamlit session websocket opened (cold start can take
      // 30-90s after waking), or the app shell rendered.
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (wsOpen) break;
        if (await shell.isVisible().catch(() => false)) break;
        await page.waitForTimeout(2000);
      }
      if (!wsOpen && !(await shell.isVisible().catch(() => false))) {
        throw new Error('app did not connect (no session websocket, no shell) within timeout');
      }

      // Dwell so the session is clearly registered as real traffic (resets the
      // 12h inactivity timer), not a transient connection.
      await page.waitForTimeout(15000);
      console.log(`[${url}] warm. title="${await page.title()}" ws=${wsOpen}`);
    } catch (err) {
      hadError = true;
      console.error(`[${url}] FAILED: ${err.message}`);
      const title = await page.title().catch(() => '?');
      console.error(`[${url}] diag: title="${title}" ws=${wsOpen}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

process.exit(hadError ? 1 : 0);
