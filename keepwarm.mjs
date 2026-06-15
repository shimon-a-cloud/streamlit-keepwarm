// Keep one or more Streamlit Community Cloud apps awake.
//
// Why a real browser: Streamlit's sleep timer is based on real browser
// (websocket) sessions. A plain HTTP request returns 200 even while the app is
// asleep and does NOT wake it or reset the timer — so uptime pings (UptimeRobot
// etc.) cannot keep a Streamlit app warm. This opens each URL in headless
// Chromium, clicks the "Yes, get this app back up!" button if the app is
// asleep, and waits for the Streamlit shell to connect.

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
// Streamlit shell selectors — any of these appearing proves the container is up
// and the websocket session has connected (which resets the sleep timer).
const SHELL = '[data-testid="stApp"], .stApp, [data-testid="stAppViewContainer"]';

let hadError = false;
const browser = await chromium.launch();

try {
  for (const url of urls) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      console.log(`\n[${url}] visiting...`);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // Both the sleep interstitial (wake button) and the live app shell are
      // rendered by JS, so wait for whichever appears first before acting.
      const wakeButton = page.getByRole('button', { name: WAKE_BUTTON });
      const shell = page.locator(SHELL).first();
      await Promise.race([
        wakeButton.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
        shell.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
      ]);

      // If asleep, click the wake button (cold start then follows).
      if (await wakeButton.isVisible().catch(() => false)) {
        console.log(`[${url}] app was asleep — clicking wake button...`);
        await wakeButton.click().catch(() => {});
      }

      // Cold start can take 30-90s; give it room.
      await shell.waitFor({ state: 'visible', timeout: 180000 });
      // Brief dwell so the session is registered as active.
      await page.waitForTimeout(8000);
      console.log(`[${url}] awake. title="${await page.title()}"`);
    } catch (err) {
      hadError = true;
      console.error(`[${url}] FAILED: ${err.message}`);
      // Diagnostics: what was actually on the page?
      const title = await page.title().catch(() => '?');
      const buttons = await page.locator('button').allInnerTexts().catch(() => []);
      console.error(`[${url}] diag: title="${title}" buttons=${JSON.stringify(buttons)}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

process.exit(hadError ? 1 : 0);
