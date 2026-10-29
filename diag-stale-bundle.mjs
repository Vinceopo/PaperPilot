import { chromium } from "playwright";

const url = "https://paperpilotph.vercel.app/";
const consoleLogs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));

// Simulate browser cache: HTML still references a deleted bundle from a prior deploy.
await page.route("**/assets/index-OLDDEAD.js", (route) =>
  route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><html><body>spa fallback</body></html>",
  })
);

await page.setContent(`<!doctype html><html><body><div id="root"></div>
<script type="module" crossorigin src="/assets/index-OLDDEAD.js"></script>
<link rel="stylesheet" href="/assets/index-zvmxqoWH.css"></body></html>`, {
  waitUntil: "domcontentloaded",
});

await page.waitForTimeout(2000);

const root = await page.evaluate(() => ({
  children: document.getElementById("root")?.childElementCount ?? 0,
  bodyBg: getComputedStyle(document.body).backgroundColor,
}));

console.log(JSON.stringify({ scenario: "stale bundle hash", root, consoleLogs }, null, 2));
await browser.close();
