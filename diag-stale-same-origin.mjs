import { chromium } from "playwright";

const consoleLogs = [];
const failed = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => consoleLogs.push({ type: "pageerror", text: err.message }));
page.on("requestfailed", (req) =>
  failed.push({ url: req.url(), failure: req.failure()?.errorText })
);

await page.route("https://paperpilotph.vercel.app/**", (route) => route.continue());
await page.setContent(
  `<!doctype html><html><body><div id="root"></div>
<script type="module" crossorigin src="https://paperpilotph.vercel.app/assets/index-C1UPT_Uj.js"></script></body></html>`,
  { waitUntil: "load" }
);
await page.waitForTimeout(3000);
const root = await page.evaluate(() => document.getElementById("root")?.childElementCount ?? 0);
console.log(JSON.stringify({ rootChildren: root, consoleLogs, failed }, null, 2));
await browser.close();
