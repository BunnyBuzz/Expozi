import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const url = args.url;
const out = args.out || "shot.png";
const width = parseInt(args.width || "1440", 10);
const wait = parseInt(args.wait || "4000", 10);

if (!url) {
  console.error("Usage: node scripts/shot.mjs --url <url> --out <file> [--width 1440] [--wait 4000]");
  process.exit(1);
}

async function launch() {
  try {
    return await chromium.launch({ channel: "chromium-headless-shell" });
  } catch {
    const exe =
      "C:\\Users\\pc\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
    return await chromium.launch({ executablePath: exe });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
} catch (e) {
  console.log("goto warning:", String(e).split("\n")[0]);
}
await page.waitForTimeout(wait);
const FIELDS = "textarea, input[type='email'], input[type='text'], input:not([type])";
if (args.type) {
  const box = page.locator(FIELDS).first();
  await box.fill(String(args.type));
  await box.press("Enter");
  await page.waitForTimeout(2500);
}
if (args.click) {
  await page.locator(String(args.click)).first().click();
  await page.waitForTimeout(1500);
}
if (args.click2) {
  await page.locator(String(args.click2)).first().click();
  await page.waitForTimeout(1500);
}
if (args.click3) {
  await page.locator(String(args.click3)).first().click();
  await page.waitForTimeout(1500);
}
if (args.type2) {
  const box2 = page.locator(FIELDS).first();
  await box2.fill(String(args.type2));
  await box2.press("Enter");
  await page.waitForTimeout(2500);
}
if (args.scrollto) {
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView(), String(args.scrollto));
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out, fullPage: !args["viewport-only"] });
console.log("saved", out);
await browser.close();
