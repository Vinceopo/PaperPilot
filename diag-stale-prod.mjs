import { chromium } from "playwright";

const consoleLogs = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => consoleLogs.push({ type: "pageerror", text: err.message }));

// Simulates user with cached index.html referencing a removed bundle.
await page.setContent(
  `<!doctype html><html><head><link rel="stylesheet" href="https://paperpilotph.vercel.app/assets/index-CRtrtjr7.css"></head>
<body><div id="root"></div>
<script type="module" crossorigin src="https://paperpilotph.vercel.app/assets/index-C1UPT_Uj.js"></script></body></html>`,
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForTimeout(2000);
const root = await page.evaluate(() => ({
  children: document.getElementById("root")?.childElementCount ?? 0,
  bodyBg: getComputedStyle(document.body).backgroundColor,
}));
console.log(JSON.stringify({ scenario: "stale cached index.html", root, consoleLogs }, null, 2));
await browser.close();
