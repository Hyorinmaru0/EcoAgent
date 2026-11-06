// Browser audit against a disposable local test server/database.
// npm install --prefix <temp>/ecocycle-browser-audit playwright
// AUDIT_BASE_URL defaults to http://127.0.0.1:5180.
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import assert from "node:assert/strict"

const playwrightPath = process.env.AUDIT_PLAYWRIGHT_PATH || join(tmpdir(), "ecocycle-browser-audit/node_modules/playwright/index.mjs")
const { chromium } = await import(pathToFileURL(playwrightPath).href)
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:5186"
const output = resolve("reports")
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(15_000)
const results = [], pageErrors = [], consoleErrors = []
const failedResources = []
page.on("response", response => { if (response.status() >= 400 && !response.url().includes("/api/auth/")) failedResources.push({ url: response.url().split("?")[0], status: response.status() }) })
page.on("pageerror", error => pageErrors.push(error.message))
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 400)) })
async function check(name, fn) {
  const start = Date.now()
  try { const details = await fn(); results.push({ name, pass: true, ms: Date.now() - start, details }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, pass: false, ms: Date.now() - start, error: error.message }); console.log(`FAIL ${name}: ${error.message.slice(0, 250)}`) }
}
let navigation = 0
async function open(hash) { await page.goto(`${base}/?audit=${++navigation}#${hash}`); await page.locator("h1").first().waitFor() }
async function fillItem(category, name) {
  await page.getByLabel(/^Item Category/).selectOption(category)
  await page.getByLabel("Item Name", { exact: true }).fill(name)
  await page.getByLabel(/^Condition/).selectOption("Unknown")
  await page.getByLabel("Quantity", { exact: true }).fill("1")
}
async function photoCase(path, category, expected) {
  await open("identify")
  const automatic = page.waitForResponse(r => r.url().includes("/api/tv-detection") && r.request().method() === "POST", { timeout: 120_000 })
  await page.locator('input[type="file"]').first().setInputFiles(path)
  const first = await automatic
  assert.equal(first.status(), 200)
  const automaticBody = await first.json()
  await fillItem(category, `Audit ${category}`)
  const response = page.waitForResponse(r => r.url().includes("/api/tv-detection") && r.request().method() === "POST", { timeout: 120_000 })
  await page.getByRole("button", { name: "Analyze E-Waste", exact: true }).click()
  const analyzed = await response
  assert.equal(analyzed.status(), 200)
  const body = await analyzed.json()
  await page.waitForFunction(() => !document.querySelector('button[type="submit"].full-width')?.disabled)
  const ready = await page.locator(".analysis-ready").count() > 0
  const details = { automatic: automaticBody.assessment, submitted: body.assessment, guidanceVisible: ready,
    candidates: body.detections.map(d => ({ className: d.className, score: d.score, verification: d.verification })) }
  if (expected === null) {
    assert.notEqual(body.assessment.status, "accepted", JSON.stringify(details))
    assert.equal(ready, false, JSON.stringify(details))
    assert.equal(await page.locator(".tv-detection-box").count(), 0)
  } else {
    assert.equal(body.assessment.status, "accepted", JSON.stringify(details))
    assert.equal(body.assessment.category, expected)
    assert.equal(ready, true)
  }
  return details
}

try {
  for (const hash of ["home", "dashboard", "identify", "recommendations", "facilities", "learn", "flow", "profile", "items", "login"]) {
    await check(`Desktop page: ${hash}`, async () => {
      await open(hash)
      const h1 = await page.locator("h1").first().innerText()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)
      assert.equal(overflow, false, "Horizontal overflow on desktop")
      return { h1 }
    })
  }
  await check("Facility directory loads actual API records and filters", async () => {
    const r = await context.request.get(`${base}/api/facilities`)
    assert.equal(r.status(), 200)
    const data = await r.json()
    const count = data.facilities.reduce((n, area) => n + area.locations.length, 0)
    assert.ok(count > 0)
    await open("facilities")
    const search = page.getByPlaceholder("Try SM North EDSA or Quezon City")
    await search.fill("SM North EDSA")
    await page.getByText("1 matching location", { exact: true }).waitFor()
    await page.locator(".collection-area-details summary").click()
    await page.locator(".collection-location-grid").getByText("SM North EDSA", { exact: true }).waitFor()
    await search.fill("this-facility-does-not-exist-audit")
    await page.waitForFunction(() => /no .*found|no .*match/i.test(document.body.innerText))
    return { facilityCount: count }
  })
  await check("Manual guidance without photo is labeled unverified", async () => {
    await open("identify"); await fillItem("Laptop", "Audit manual laptop")
    await page.getByRole("button", { name: "Analyze E-Waste", exact: true }).click()
    await page.getByText("Manual item guidance — no photo verification", { exact: true }).waitFor()
    assert.equal(await page.locator("#nearest-facility-panel").count(), 1)
    return { verifiedPhoto: false, guidanceVisible: true }
  })
  await check("Editing category invalidates an existing manual result", async () => {
    await page.getByLabel(/^Item Category/).selectOption("TV")
    assert.equal(await page.locator(".analysis-ready").count(), 0)
    assert.equal(await page.locator("#nearest-facility-panel").count(), 0)
  })
  await check("Camera denial offers a file fallback and closes with Escape", async () => {
    await open("identify")
    await page.getByRole("button", { name: "Take a photo", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Take a device photo" })
    await dialog.waitFor()
    await dialog.getByRole("alert").first().waitFor()
    assert.ok(await dialog.getByRole("button", { name: "Choose a saved photo", exact: true }).isVisible())
    await page.keyboard.press("Escape")
    assert.equal(await dialog.count(), 0)
  })
  for (const entry of (process.env.AUDIT_SKIP_PHOTOS === "1" ? [] : [
    ["Wallet rejected end to end", join(tmpdir(), "ecocycle-wallet-q82.jpg"), "Mobile Phone", null],
    ["Real phone accepted end to end", join(tmpdir(), "ecocycle-phone.jpg"), "Mobile Phone", "Mobile Phone"],
    ["Real TV accepted end to end", resolve("ml/tv_training/dataset/images/val/frame_000161.jpg"), "TV", "TV"],
    ["Real laptop accepted end to end", join(tmpdir(), "ecocycle-laptop-open.jpg"), "Laptop", "Laptop"],
    ["Laptop close-up classified correctly", join(tmpdir(), "ecocycle-laptop.jpg"), "Laptop", "Laptop"],
    ["Wrong selected category blocks phone guidance", join(tmpdir(), "ecocycle-phone.jpg"), "Laptop", null],
  ])) await check(entry[0], () => photoCase(...entry.slice(1)))

  await check("Granted location ranks the exact SM North EDSA venue first", async () => {
    const data = await (await context.request.get(`${base}/api/facilities`)).json()
    const north = data.facilities.flatMap(a => a.locations).find(f => f.name === "SM North EDSA")
    assert.ok(north?.coordinates)
    await context.setGeolocation({ ...north.coordinates, accuracy: 10 })
    await context.grantPermissions(["geolocation"], { origin: base })
    await open("identify"); await fillItem("Laptop", "Audit location laptop")
    await page.getByRole("button", { name: "Analyze E-Waste", exact: true }).click()
    await page.locator(".nearest-facility-summary h3").waitFor()
    assert.equal(await page.locator(".nearest-facility-summary h3").innerText(), "SM North EDSA")
    const href = await page.locator(".nearest-facility-summary a").getAttribute("href")
    assert.ok(href.includes("google.com/maps/dir/"))
    await page.locator(".nearest-facility-map .gm-style").waitFor()
    return { nearest: "SM North EDSA", distanceText: await page.locator(".nearest-facility-summary").innerText(), mapInitialized: true }
  })
  await check("Learn cards open and close their educational content", async () => {
    await open("learn")
    const cards = page.locator(".lesson-card")
    assert.equal(await cards.count(), 5)
    for (let i = 0; i < 5; i++) {
      await cards.nth(i).click()
      assert.equal(await cards.nth(i).locator(".article-inline").count(), 1)
      await cards.nth(i).click()
      assert.equal(await cards.nth(i).locator(".article-inline").count(), 0)
    }
  })
  await check("Chat UI sends an unsupported-device question and displays the answer", async () => {
    await open("home")
    await page.getByRole("button", { name: "Ask EcoAgent", exact: true }).last().click()
    const input = page.getByRole("textbox", { name: "Message EcoAgent Ask Bot" })
    await input.fill("Can you identify my refrigerator?")
    const response = page.waitForResponse(r => r.url().endsWith("/api/chat"), { timeout: 45_000 })
    await page.getByRole("button", { name: "Send message", exact: true }).click()
    const r = await response
    assert.equal(r.status(), 200)
    const body = await r.json()
    assert.ok(body.answer && /TV|phone|laptop/i.test(body.answer))
    await page.locator(".chat-response-text").last().waitFor()
    return { topic: body.topic, answer: body.answer }
  })

  await check("Dashboard item count agrees with the item list", async () => {
    await open("dashboard")
    const text = await page.locator(".stat-card").filter({ hasText: "Registered E-Waste Items" }).innerText()
    const count = Number(text.match(/\d+/)?.[0])
    await open("items")
    const listed = await page.locator(".facility-grid .facility-card").count()
    assert.equal(count, listed, `Dashboard reports ${count}; Registered E-Waste lists ${listed}`)
  })

  const email = `system-audit-${Date.now()}@example.invalid`, password = "AuditOnly12345"
  await check("Registration creates an authenticated account", async () => {
    await open("login"); await page.getByRole("button", { name: "Create an account", exact: true }).click()
    await page.locator("#register-name").fill("System Audit")
    await page.locator("#register-email").fill(email)
    await page.locator("#register-password").fill(password)
    await page.locator("#register-confirm").fill(password)
    await page.locator("#register-user-type").selectOption("Student")
    await page.locator("#register-terms").check()
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/register"))
    await page.getByRole("button", { name: "Create Account", exact: true }).click()
    assert.equal((await response).status(), 201)
    await page.waitForURL(url => url.hash === "#dashboard")
    const me = await (await context.request.get(`${base}/api/auth/me`)).json()
    assert.equal(me.user.fullName, "System Audit")
    const cookies = await context.cookies()
    assert.ok(cookies.some(c => c.name.includes("ecocycle_session") && c.httpOnly))
    return { authenticated: true, httpOnlyCookie: true }
  })
  await check("Session survives browser reload", async () => {
    await open("dashboard")
    await page.getByRole("heading", { name: "Hello, System Audit!", exact: true }).waitFor()
  })
  await check("Saved profile changes survive a reload", async () => {
    await open("profile")
    await page.getByLabel("Full Name", { exact: true }).fill("System Audit Updated")
    const response = page.waitForResponse(r => r.url().endsWith("/api/account/profile"))
    await page.getByRole("button", { name: "Save Changes", exact: true }).click()
    assert.equal((await response).status(), 200)
    await page.reload()
    await page.waitForFunction(() => !document.querySelector(".profile-actions button[type=submit]")?.textContent.includes("Saving"))
    await page.waitForFunction(() => document.querySelector(".profile-overview h2")?.textContent === "System Audit Updated")
    assert.equal(await page.getByLabel("Full Name", { exact: true }).inputValue(), "System Audit Updated")
  })
  await check("Logout invalidates the session", async () => {
    await open("profile")
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/logout"))
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    assert.equal((await response).status(), 200)
    const me = await (await context.request.get(`${base}/api/auth/me`)).json()
    assert.equal(me.user, null)
  })
  await check("Wrong password is rejected and correct login works", async () => {
    const wrong = await context.request.post(`${base}/api/auth/login`, { data: { email, password: "WrongPassword123" } })
    assert.equal(wrong.status(), 401)
    const correct = await context.request.post(`${base}/api/auth/login`, { data: { email, password } })
    assert.equal(correct.status(), 200)
    await context.request.post(`${base}/api/auth/logout`, { data: {} })
  })
  await check("Duplicate account is rejected", async () => {
    const r = await context.request.post(`${base}/api/auth/register`, { data: { email, password, fullName: "System Audit", userType: "Student" } })
    assert.equal(r.status(), 409)
  })
  await check("Login form signs the test account in", async () => {
    await open("login")
    await page.locator("#login-email").fill(email)
    await page.locator("#login-password").fill(password)
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login"))
    await page.getByRole("button", { name: "Login", exact: true }).last().click()
    assert.equal((await response).status(), 200)
    await page.waitForURL(url => url.hash === "#dashboard")
  })
  await check("Profile cancel restores saved information and disables unchanged save", async () => {
    await open("profile")
    const name = page.getByLabel("Full Name", { exact: true })
    await name.fill("Unsaved draft")
    await page.getByRole("button", { name: "Cancel changes", exact: true }).click()
    assert.equal(await name.inputValue(), "System Audit Updated")
    assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true)
  })
  await check("Facility details include address, schedule kind, and source links", async () => {
    await open("facilities")
    await page.getByPlaceholder("Try SM North EDSA or Quezon City").fill("SM North EDSA")
    await page.locator(".collection-area-details summary").click()
    await page.getByRole("button", { name: "View facility details", exact: true }).click()
    await page.locator(".facility-detail-main").waitFor()
    assert.match(await page.locator(".analysis-list").innerText(), /4F Cyberzone/)
    assert.ok(await page.locator(".facility-visit-note a").count() > 0)
  })
  await check("Saved item and facility persist after reload and dashboard counts agree", async () => {
    await page.getByRole("button", { name: "Save Facility", exact: true }).click()
    await page.getByRole("button", { name: "Remove Saved Facility", exact: true }).waitFor()
    await open("identify"); await fillItem("Laptop", "Browser audit saved laptop")
    await page.getByRole("button", { name: "Analyze E-Waste", exact: true }).click()
    await page.getByRole("button", { name: "Save to My Items", exact: true }).click()
    await page.getByRole("button", { name: "Saved to My Items", exact: true }).waitFor()
    await page.evaluate(() => { location.hash = "profile" })
    await page.getByLabel("Full Name", { exact: true }).fill("System Audit Final")
    const profileSaved = page.waitForResponse(r => r.url().endsWith("/api/account/profile"))
    await page.getByRole("button", { name: "Save Changes", exact: true }).click()
    assert.equal((await profileSaved).status(), 200)
    await page.evaluate(() => { location.hash = "identify" })
    await page.getByRole("button", { name: "Saved to My Items", exact: true }).waitFor()
    await open("items")
    await page.getByRole("heading", { name: "Browser audit saved laptop", exact: true }).waitFor()
    await open("profile")
    await page.waitForFunction(() => [...document.querySelectorAll(".profile-summary strong")].every(el => el.textContent === "1"))
    const summary = await page.locator(".profile-summary").innerText()
    assert.match(summary, /1[\s\S]*Saved items/)
    assert.match(summary, /1[\s\S]*Saved facilities/)
  })
  await check("Failed directory load offers a working retry", async () => {
    let failDirectory = true
    await page.route("**/api/facilities", async route => {
      if (failDirectory) { failDirectory = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Audit simulated outage" }) }) }
      else await route.continue()
    })
    await open("facilities")
    await page.getByRole("button", { name: "Try loading again", exact: true }).click()
    await page.locator(".collection-area-details").first().waitFor()
    await page.unroute("**/api/facilities")
  })
  await check("Google Maps loader is shared across map views", async () => {
    assert.ok(await page.locator('script[src*="maps.googleapis.com/maps/api/js"]').count() <= 1)
  })
  await check("Chat request errors can be retried and Gemini answers are labeled", async () => {
    let calls = 0
    await page.route("**/api/chat", route => {
      calls += 1
      return route.fulfill({ status: calls === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(calls === 1 ? { error: "Audit simulated chat outage" } : { topic: "gemini-chat", answer: "Audit recovered answer" }) })
    })
    await page.getByRole("button", { name: "Ask EcoAgent", exact: true }).last().click()
    await page.getByRole("textbox", { name: "Message EcoAgent Ask Bot" }).fill("How can I reuse my phone?")
    await page.getByRole("button", { name: "Send message", exact: true }).click()
    await page.getByRole("button", { name: "Try again", exact: true }).click()
    await page.getByText("Audit recovered answer", { exact: true }).waitFor()
    assert.equal(await page.locator(".chat-response-label").last().textContent(), "Gemini")
    await page.getByRole("button", { name: "Close EcoAgent Ask Bot", exact: true }).last().click()
    await page.unroute("**/api/chat")
  })
  await check("Signing out cancels a pending chat and clears the previous conversation", async () => {
    let pending
    let started
    const ready = new Promise(resolve => { started = resolve })
    await page.route("**/api/chat", route => { pending = route; started() })
    await page.getByRole("button", { name: "Ask EcoAgent", exact: true }).last().click()
    await page.getByRole("textbox", { name: "Message EcoAgent Ask Bot" }).fill("Private previous account question")
    await page.getByRole("button", { name: "Send message", exact: true }).click()
    await ready
    await page.getByRole("button", { name: "Close EcoAgent Ask Bot", exact: true }).last().click()
    await page.evaluate(() => { location.hash = "profile" })
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await page.waitForURL(url => url.hash === "#home")
    await pending.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ topic: "gemini-chat", answer: "Stale private answer" }) }).catch(() => {})
    await page.getByRole("button", { name: "Ask EcoAgent", exact: true }).last().click()
    assert.doesNotMatch(await page.locator(".chat-messages").innerText(), /Private previous|Stale private|Audit recovered/)
    assert.equal(await page.getByRole("textbox", { name: "Message EcoAgent Ask Bot" }).isEnabled(), true)
    await page.getByRole("button", { name: "Close EcoAgent Ask Bot", exact: true }).last().click()
    await page.unroute("**/api/chat")
  })
  for (const hash of ["home", "identify", "facilities", "dashboard", "login", "profile", "items"]) {
    await check(`Mobile page: ${hash}`, async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await open(hash)
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
      assert.ok(dimensions.scrollWidth <= dimensions.width + 2, JSON.stringify(dimensions))
      return dimensions
    })
  }
  await check("No uncaught browser JavaScript errors", async () => { assert.deepEqual(pageErrors, []) })
} finally {
  await browser.close()
  const report = { baseUrl: base, generatedAt: new Date().toISOString(), results, pageErrors, consoleErrors: [...new Set(consoleErrors)], failedResources }
  await writeFile(join(output, "system-audit-2026-11-06.json"), JSON.stringify(report, null, 2))
  if (results.some(result => !result.pass)) process.exitCode = 1
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, report: join(output, "system-audit-2026-11-06.json") }))
}
