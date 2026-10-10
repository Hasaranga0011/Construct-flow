const { chromium } = require("playwright");
const fs = require("fs"),
  assert = require("node:assert/strict");
const fixtures = require("./responsive-fixtures.cjs");
process.chdir(require("path").resolve(__dirname, ".."));
(async () => {
  const env = fs.readFileSync(".env", "utf8"),
    base = env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
  const tables = fixtures("worker"),
    uid = tables.profiles[0].id,
    exp = Math.floor(Date.now() / 1000) + 3600;
  tables.labour[0].date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const user = {
    id: uid,
    email: "worker@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { role: "worker" },
    app_metadata: { provider: "email" },
  };
  const token =
    Buffer.from("{}").toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({ sub: uid, exp, role: "authenticated" }),
    ).toString("base64url") +
    ".test";
  const preview = process.env.RESPONSIVE_URL || "http://localhost:8081";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    }),
    page = await context.newPage();
  let offline = false;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${new URL(base).hostname.split(".")[0]}-auth-token`,
      session: {
        access_token: token,
        refresh_token: "fixture",
        expires_at: exp,
        expires_in: 3600,
        token_type: "bearer",
        user,
      },
    },
  );
  await page.route("**/auth/v1/**", (r) => r.fulfill({ json: user }));
  await page.route("**/rest/v1/**", (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      table = url.pathname.split("/").pop();
    if (
      offline &&
      table === "profiles" &&
      url.searchParams.get("select") === "*"
    )
      return r.abort();
    let data = tables[table] || [];
    for (const [key, value] of url.searchParams)
      if (value.startsWith("eq."))
        data = data.filter((row) => String(row[key]) === value.slice(3));
    return r.fulfill({
      json: req.headers().accept?.includes("object+json")
        ? data[0] || null
        : data,
    });
  });
  await page.route("**/api/**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/worker/site"))
      return r.fulfill({
        json: {
          project: tables.projects[0],
          site: tables.sites[0],
          manager: {
            full_name: "Site Manager",
            contact_number: "+94771234567",
          },
        },
      });
    if (url.pathname.endsWith("/worker/payroll"))
      return r.fulfill({
        json: {
          total_days: 1,
          total_hours: 10,
          overtime_hours: 2,
          daily_rate: 3500,
          basic_pay: 3500,
          overtime_pay: 1312.5,
          total_pay: 4812.5,
          final: false,
        },
      });
    return r.fulfill({ json: [] });
  });
  const subscriptions = [];
  await page.routeWebSocket("**/realtime/**", (ws) =>
    ws.onMessage((raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const v2 = Array.isArray(msg);
      if (v2)
        msg = {
          join_ref: msg[0],
          ref: msg[1],
          topic: msg[2],
          event: msg[3],
          payload: msg[4],
        };
      const send = (event, payload, ref = msg.ref) =>
        ws.send(
          JSON.stringify(
            v2
              ? [msg.join_ref, ref, msg.topic, event, payload]
              : { topic: msg.topic, event, ref, payload },
          ),
        );
      if (msg.event === "phx_join") {
        const changes = (msg.payload.config?.postgres_changes || []).map(
          (c, i) => ({ ...c, id: i + 1 }),
        );
        subscriptions.push({ send, topic: msg.topic, changes });
        send("phx_reply", {
          status: "ok",
          response: { postgres_changes: changes },
        });
      } else if (msg.event === "heartbeat" || msg.event === "phx_leave")
        send("phx_reply", { status: "ok", response: {} });
    }),
  );
  function changed(table, record) {
    for (const sub of subscriptions) {
      const ids = sub.changes.filter((c) => c.table === table).map((c) => c.id);
      if (ids.length)
        sub.send(
          "postgres_changes",
          {
            ids,
            data: {
              schema: "public",
              table,
              type: "UPDATE",
              commit_timestamp: new Date().toISOString(),
              columns: Object.entries(record).map(([name, value]) => ({
                name,
                type: typeof value === "number" ? "numeric" : "text",
              })),
              record,
              old_record: { id: record.id },
              errors: null,
            },
          },
          null,
        );
    }
  }

  try {
    await page.goto(preview + "/worker/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page
      .getByText("Show my QR", { exact: true })
      .waitFor({ timeout: 30000 });
    await page.screenshot({
      path: "../.validation-web/worker-dashboard-360.png",
    });
    await page.waitForTimeout(800);
    assert.ok(
      subscriptions.some((s) =>
        s.changes.some(
          (c) => c.table === "labour" && c.filter === `worker_id=eq.${uid}`,
        ),
      ),
      "attendance subscription must be scoped",
    );
    tables.labour[0].check_out_time = new Date().toISOString();
    changed("labour", tables.labour[0]);
    await page.getByText(/^Checked out at/).waitFor({ timeout: 8000 });
    console.log("PASS: scoped Realtime event updates Today without refresh");

    await page.getByText("Show my QR", { exact: true }).click();
    await page
      .getByText("Hold your phone steady for the Site Manager to scan", {
        exact: true,
      })
      .waitFor();
    assert.ok(await page.getByText("W-0012", { exact: true }).count());
    await page.waitForTimeout(500);
    await page.screenshot({ path: "../.validation-web/worker-qr-360.png" });
    await page.getByText("Close QR", { exact: true }).click();
    await page.goto(preview + "/worker/payroll", {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.getByText("Download PDF", { exact: true }).waitFor();
    const downloaded = page.waitForEvent("download");
    await page.getByText("Download PDF", { exact: true }).click();
    const file = await downloaded;
    await file.saveAs("../.validation-web/worker-payslip.pdf");
    assert.equal(
      fs
        .readFileSync("../.validation-web/worker-payslip.pdf")
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
    await page.getByText("View", { exact: true }).click();
    await page.getByText(/Gross Rs\./).waitFor();
    offline = true;
    await page.goto(preview + "/worker/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page
      .getByText("Show my saved QR", { exact: true })
      .waitFor({ timeout: 25000 });
    await page.getByText("Show my saved QR", { exact: true }).click();
    await page.getByText("Offline - Saved QR", { exact: true }).waitFor();
    await page.getByText("Close QR", { exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: phone QR opens/closes, short code, offline cached QR, payslip detail and valid PDF download.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
