// Regression test for the browser-tier timeout guard:
// a completed render's guard must not fire later and destroy the hidden
// window while a subsequent render is running ("Object has been destroyed").
//   npx electron scripts/browser-guard-test.cjs
const { app } = require("electron");
app.on("window-all-closed", () => {});

const { render, destroy } = require("../electron/rag/browser.cjs");

const ext = () => ({ title: document.title, len: (document.body.innerText || "").length });

app.whenReady().then(async () => {
  const t0 = Date.now();
  let ok = true;
  try {
    // 1) quick render with a short guard (fires at t=5s in the old code)
    const r1 = await render("https://example.com", ext, { timeout: 5000 });
    console.log(`r1 ok after ${Date.now() - t0}ms:`, JSON.stringify(r1).slice(0, 80));
    // 2) slow render spanning t=5s — the old stale guard destroyed the window here
    const r2 = await render("https://example.com", ext, { settle: 8000 });
    console.log(`r2 ok after ${Date.now() - t0}ms:`, JSON.stringify(r2).slice(0, 80));
    // 3) window must still be alive afterwards
    const r3 = await render("https://example.com", ext);
    console.log(`r3 ok after ${Date.now() - t0}ms:`, JSON.stringify(r3).slice(0, 80));
  } catch (e) {
    ok = false;
    console.log("FAILED:", String((e && e.message) || e));
  }
  // 4) an actually-hung render must still time out and be killed
  try {
    await render("https://httpbin.org/delay/30", ext, { timeout: 4000 });
    console.log("hung render: unexpectedly succeeded");
    ok = false;
  } catch (e) {
    console.log("hung render timed out as expected:", String((e && e.message) || e).slice(0, 80));
  }
  destroy();
  console.log(ok ? "GUARD TEST PASS" : "GUARD TEST FAIL");
  app.exit(ok ? 0 : 1);
});
