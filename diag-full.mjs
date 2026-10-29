import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function diagnose(label, url, screenshotPath) {
  const consoleLogs = [];
  const failedRequests = [];
  const responses = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on("console", (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
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

  const jsAssets = [];
  page.on("response", async (res) => {
    const u = res.url();
    const ct = res.headers()["content-type"] || "";
    if (/\.js(\?|$)/.test(u) || ct.includes("javascript")) {
      jsAssets.push({ url: u, status: res.status(), contentType: ct });
    }
    if (res.status() >= 400) {
      responses.push({ url: u, status: res.status(), contentType: ct });
    }
  });

  let gotoError = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  } catch (e) {
    gotoError = String(e);
  }
  await page.waitForTimeout(3000);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const rootHtml = await page.evaluate(() => {
    const root = document.getElementById("root");
    return {
      rootChildCount: root?.childElementCount ?? -1,
      rootInnerText: (root?.innerText || "").slice(0, 800),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      title: document.title,
      scriptSrcs: [...document.querySelectorAll("script[src]")].map((s) => s.src),
    };
  });

  const mainJs = jsAssets.find((a) => /\/assets\/index-[^/]+\.js/.test(a.url));

  await browser.close();

  return {
    label,
    url,
    gotoError,
    rootHtml,
    mainJsBundle: mainJs || null,
    jsAssets,
    badStatusResponses: responses,
    consoleLogs,
    failedRequests,
    screenshotPath,
  };
}

const base = "c:\\Users\\vince\\Downloads\\PaperPilot-main";
const reports = [];

reports.push(
  await diagnose(
    "local",
    "http://127.0.0.1:5173/",
    `${base}\\diag-screenshot-local.png`
  )
);
reports.push(
  await diagnose(
    "production",
    "https://paperpilotph.vercel.app/",
    `${base}\\diag-screenshot-prod.png`
  )
);

const outPath = `${base}\\diag-report-full.json`;
writeFileSync(outPath, JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
console.error("Wrote", outPath);
