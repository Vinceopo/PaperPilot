import { chromium } from "playwright";
import { writeFileSync } from "fs";

const url = "http://127.0.0.1:5173/";
const consoleLogs = [];
const failedRequests = [];
const badResponses = [];
const jsAssets = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  consoleLogs.push({ type: "pageerror", text: err.message, stack: err.stack });
});
page.on("requestfailed", (req) => {
  failedRequests.push({
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText || "unknown",
  });
});
page.on("response", (res) => {
  const u = res.url();
  const ct = res.headers()["content-type"] || "";
  if (/\.js(\?|$)/.test(u) || ct.includes("javascript")) {
    jsAssets.push({ url: u, status: res.status(), contentType: ct });
  }
  if (res.status() >= 400) {
    badResponses.push({ url: u, status: res.status(), contentType: ct });
  }
});

await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(4000);

const screenshotPath = "c:\\Users\\vince\\Downloads\\PaperPilot-main\\diag-screenshot-local.png";
await page.screenshot({ path: screenshotPath, fullPage: true });

const rootHtml = await page.evaluate(() => ({
  rootChildCount: document.getElementById("root")?.childElementCount ?? -1,
  rootInnerText: (document.getElementById("root")?.innerText || "").slice(0, 800),
  title: document.title,
}));

const report = { url, rootHtml, jsAssets, badResponses, consoleLogs, failedRequests, screenshotPath };
writeFileSync("c:\\Users\\vince\\Downloads\\PaperPilot-main\\diag-report-local.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
