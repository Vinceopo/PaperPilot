import { chromium } from "playwright";
import { writeFileSync } from "fs";

const url = "https://paperpilotph.vercel.app/";
const consoleLogs = [];
const failedRequests = [];

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
    failure: req.failure()?.errorText || "unknown",
  });
});

const mainJsPattern = /\/assets\/index-[^/]+\.js/;
let mainJsStatus = null;
let mainJsUrl = null;

page.on("response", (res) => {
  const u = res.url();
  if (mainJsPattern.test(u)) {
    mainJsUrl = u;
    mainJsStatus = res.status();
  }
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

const screenshotPath = "c:\\Users\\vince\\Downloads\\PaperPilot-main\\diag-screenshot.png";
await page.screenshot({ path: screenshotPath, fullPage: true });

const rootHtml = await page.evaluate(() => {
  const root = document.getElementById("root");
  return {
    rootChildCount: root?.childElementCount ?? -1,
    rootInnerText: (root?.innerText || "").slice(0, 500),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    title: document.title,
  };
});

const report = {
  url,
  rootHtml,
  mainJsUrl,
  mainJsStatus,
  consoleLogs,
  failedRequests,
  screenshotPath,
};

console.log(JSON.stringify(report, null, 2));
writeFileSync(
  "c:\\Users\\vince\\Downloads\\PaperPilot-main\\diag-report.json",
  JSON.stringify(report, null, 2)
);

await browser.close();
