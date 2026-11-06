import assert from "node:assert/strict"
import test from "node:test"
import { authRequest } from "../src/components/auth/authApi.ts"

test("account requests reject HTML responses instead of treating them as success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Host error</html>", { status: 200 }))
  await assert.rejects(authRequest("/api/auth/me"), /invalid response/)
})

test("account mutations send the expected account and preserve API errors", async (t) => {
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/auth/logout")
    assert.equal(options.headers["X-EcoCycle-Account"], "7")
    assert.equal(options.credentials, "same-origin")
    return Response.json({ error: "Account changed in another tab." }, { status: 409 })
  })
  await assert.rejects(authRequest("/api/auth/logout", {}, 7), /Account changed/)
})

test("account network failures show a useful connection message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed") })
  await assert.rejects(authRequest("/api/auth/me"), /Check your connection/)
})

test("empty successful payloads cannot become a broken profile or workspace", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}))
  await assert.rejects(authRequest("/api/auth/me"), /invalid account details/)
  await assert.rejects(authRequest("/api/account/data"), /invalid saved data/)
})

test("stalled account requests time out without retrying a mutation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let calls = 0
  t.mock.method(globalThis, "fetch", async (path, { signal }) => {
    calls += 1
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }))
  })
  const request = authRequest("/api/account/profile", { fullName: "Example User" })
  const result = assert.rejects(request, /timed out.*Reload/)
  t.mock.timers.tick(20_000)
  await result
  assert.equal(calls, 1)
})
