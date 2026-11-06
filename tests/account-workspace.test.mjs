import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { mkdtemp, rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

test("account workspace persists records and isolates two authenticated users", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ecocycle-account-tests-"))
  process.env.ECOCYCLE_DB_PATH = join(directory, "accounts.sqlite")
  const { authApiMiddleware } = await import("../server/auth-api.mjs")
  const { database, getCollectionLocations } = await import("../server/facility-database.mjs")
  const server = createServer((req, res) => authApiMiddleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    database.close()
    for (const suffix of ["", "-wal", "-shm"]) await rm(join(directory, "accounts.sqlite" + suffix), { force: true })
    await rmdir(directory)
  })
  async function api(path, cookie, body, extra = {}) {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: {
      ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json", Origin: origin } : {}), ...extra,
    }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] }
  }
  const registration = { fullName: "Account One", email: "one@example.com", userType: "Student", password: "TestingAccount42" }
  const first = await api("/api/auth/register", null, registration)
  assert.equal(first.status, 201)
  const second = await api("/api/auth/register", null, { ...registration, fullName: "Account Two", email: "two@example.com" })
  assert.equal(second.status, 201)
  assert.equal((await api("/api/account/data")).status, 401)
  const entry = { clientKey: randomUUID(), name: "My phone", category: "Mobile Phone", condition: "Unknown", quantity: 2, analysisKind: "photo", photoCondition: "Damage could not be confirmed" }
  const saved = await api("/api/account/items", first.cookie, entry)
  assert.equal(saved.status, 200)
  assert.equal(saved.body.items.length, 1)
  assert.equal(saved.body.items[0].photoCondition, entry.photoCondition)
  const duplicate = await api("/api/account/items", first.cookie, entry)
  assert.equal(duplicate.body.items.length, 1, "Retry must not create duplicate items")
  assert.equal((await api("/api/account/items", first.cookie, { ...entry, quantity: -1 })).status, 400)
  assert.equal((await api("/api/account/items", first.cookie, { ...entry, clientKey: "-".repeat(36) })).status, 400, "Malformed idempotency keys must be rejected")
  assert.equal((await api("/api/account/profile", first.cookie, { fullName: "Account One", userType: "Student", location: 42 })).status, 400, "Invalid location types must not erase preferences")
  assert.equal((await api("/api/account/items", first.cookie, entry, { Origin: "https://other.example" })).status, 403)
  assert.equal((await api("/api/account/items", second.cookie, entry, { "X-EcoCycle-Account": String(first.body.user.id) })).status, 409,
    "A stale tab must not write to a different account after another tab signs in")
  assert.deepEqual((await api("/api/account/data", second.cookie)).body, { items: [], savedFacilities: [] })
  assert.equal((await api("/api/auth/logout", second.cookie, {}, { "X-EcoCycle-Account": String(first.body.user.id) })).status, 409)
  assert.equal((await api("/api/auth/me", second.cookie)).body.user.id, second.body.user.id, "An old tab cannot log out a different account")
  assert.equal((await api("/api/account/items/remove", second.cookie, { id: saved.body.items[0].id })).status, 404)
  const area = getCollectionLocations()[0], facility = area.locations[0]
  const bookmark = { name: facility.name, municipality: area.municipality, saved: true }
  const bookmarked = await api("/api/account/facilities/toggle", first.cookie, bookmark)
  assert.equal(bookmarked.body.savedFacilities[0].name, facility.name)
  assert.equal((await api("/api/account/facilities/toggle", first.cookie, bookmark)).body.savedFacilities.length, 1)
  assert.equal((await api("/api/account/facilities/toggle", second.cookie, { ...bookmark, saved: false })).body.savedFacilities.length, 0)
  const profile = await api("/api/account/profile", first.cookie, { fullName: "Updated Account", userType: "Household", location: "Quezon City" })
  assert.equal(profile.body.user.location, "Quezon City")
  assert.equal((await api("/api/auth/me", first.cookie)).body.user.fullName, "Updated Account")
  await api("/api/auth/logout", first.cookie, {})
  assert.equal((await api("/api/account/data", first.cookie)).status, 401)
  const login = await api("/api/auth/login", null, { email: registration.email, password: registration.password })
  assert.equal(login.body.user.location, "Quezon City")
  const restored = await api("/api/account/data", login.cookie)
  assert.equal(restored.body.items.length, 1)
  assert.equal(restored.body.savedFacilities.length, 1)
  const relogin = await api("/api/auth/login", login.cookie, { email: registration.email, password: registration.password })
  assert.equal(relogin.status, 200)
  assert.equal((await api("/api/auth/me", login.cookie)).body.user, null, "Signing in again rotates the previous browser session")
  assert.equal((await api("/api/account/items/remove", relogin.cookie, { id: saved.body.items[0].id })).body.items.length, 0)
})
