import { chromium } from "playwright";

const url = "https://paperpilotph.vercel.app/";
const responses = [];
const consoleLogs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => consoleLogs.push({ type: "pageerror", text: err.message }));
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("paperpilotph.vercel.app")) {
    responses.push({
      url: u.replace("https://paperpilotph.vercel.app", ""),
      status: res.status(),
      contentType: res.headers()["content-type"] || "",
    });
  }
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);

const bad = responses.filter(
  (r) =>
    r.status >= 400 ||
    (r.url.includes("/assets/") && r.contentType.includes("text/html"))
);

console.log(
  JSON.stringify(
    {
      failedOrHtmlAssets: bad,
      jsEntries: responses.filter((r) => r.url.endsWith(".js")),
      cssEntries: responses.filter((r) => r.url.endsWith(".css")),
      consoleLogs,
    },
    null,
    2
  )
);

await browser.close();
