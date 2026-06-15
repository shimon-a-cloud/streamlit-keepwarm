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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // If asleep, Streamlit serves a platform interstitial with a wake button.
      const wakeButton = page.getByRole('button', { name: WAKE_BUTTON });
      if (await wakeButton.count().catch(() => 0)) {
        console.log(`[${url}] app was asleep — clicking wake button...`);
        await wakeButton.first().click().catch(() => {});
      }

      // Cold start can take 30-90s; give it room.
      await page.waitForSelector(SHELL, { timeout: 150000 });
      // Brief dwell so the session is registered as active.
      await page.waitForTimeout(8000);
      console.log(`[${url}] awake. title="${await page.title()}"`);
    } catch (err) {
      hadError = true;
      console.error(`[${url}] FAILED: ${err.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

process.exit(hadError ? 1 : 0);
