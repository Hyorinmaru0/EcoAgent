import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  createDemoProfile,
  userTypes,
  validateLogin,
  validateRegistration,
} from "../src/components/auth/authValidation.ts"
import { readRememberedEmail, rememberedEmailKey, rememberEmail } from "../src/components/auth/rememberEmail.ts"

const validLogin = { email: "raven@example.com", password: "EcoCycle123", remember: false }
const validRegistration = {
  fullName: "Raven Santos",
  email: "raven@example.com",
  password: "EcoCycle123",
  confirmPassword: "EcoCycle123",
  userType: "Household",
  terms: true,
}

test("client validation enforces the API's maximum field lengths", () => {
  assert.ok(validateLogin({ ...validLogin, password: "a1".repeat(65) }).password)
  assert.ok(validateLogin({ ...validLogin, email: "a".repeat(250) + "@example.com" }).email)
  assert.ok(validateRegistration({ ...validRegistration, fullName: "x".repeat(101) }).fullName)
})

test("login rejects empty fields and malformed emails", () => {
  assert.ok(validateLogin({ ...validLogin, email: "", password: "" }).email)
  assert.ok(validateLogin({ ...validLogin, email: "", password: "" }).password)
  for (const email of ["raven", "raven@", "@example.com", "raven@example", "a b@example.com", "a@@example.com"])
    assert.ok(validateLogin({ ...validLogin, email }).email, email)
  assert.deepEqual(validateLogin({ ...validLogin, email: " Raven+demo@Example.com " }), {})
})

test("password rules reject short passwords and require a letter and number", () => {
  for (const password of ["abc123", "abcdefgh", "12345678", "        "])
    assert.ok(validateLogin({ ...validLogin, password }).password, password)
  assert.deepEqual(validateLogin(validLogin), {})
})

test("registration validates name, confirmation, user type, and terms", () => {
  const errors = validateRegistration({ ...validRegistration, fullName: "  ", confirmPassword: "different", userType: "Admin", terms: false })
  for (const field of ["fullName", "confirmPassword", "userType", "terms"]) assert.ok(errors[field], field)
  assert.ok(validateRegistration({ ...validRegistration, confirmPassword: "" }).confirmPassword)
  assert.ok(validateRegistration({ ...validRegistration, userType: "" }).userType)
  assert.ok(validateRegistration({ ...validRegistration, email: "invalid", password: "short" }).email)
  assert.ok(validateRegistration({ ...validRegistration, email: "invalid", password: "short" }).password)
  for (const userType of userTypes) assert.deepEqual(validateRegistration({ ...validRegistration, userType }), {})
})

test("password confirmation compares exact values without trimming", () => {
  assert.ok(validateRegistration({ ...validRegistration, confirmPassword: `${validRegistration.password} ` }).confirmPassword)
})

test("registered profile is normalized and contains no credentials", () => {
  const profile = createDemoProfile({ ...validRegistration, fullName: " Raven Santos ", email: " Raven@Example.com " })
  assert.deepEqual(profile, { fullName: "Raven Santos", email: "raven@example.com", userType: "Household" })
  assert.equal("password" in profile, false)
  assert.equal("confirmPassword" in profile, false)
})

test("Remember Me stores only an email and removes it when unchecked", () => {
  const data = new Map()
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
  rememberEmail(" Raven@Example.com ", true, storage)
  assert.deepEqual([...data], [[rememberedEmailKey, "raven@example.com"]])
  assert.equal(readRememberedEmail(storage), "raven@example.com")
  rememberEmail("raven@example.com", false, storage)
  assert.equal(readRememberedEmail(storage), "")
  assert.equal(data.size, 0)
  storage.setItem(rememberedEmailKey, "corrupt-data")
  assert.equal(readRememberedEmail(storage), "")
})

test("blocked browser storage does not block demo login", () => {
  const unavailable = () => { throw new Error("Storage disabled") }
  const storage = { getItem: unavailable, setItem: unavailable, removeItem: unavailable }
  assert.equal(readRememberedEmail(storage), "")
  assert.doesNotThrow(() => rememberEmail(validLogin.email, true, storage))
  assert.doesNotThrow(() => rememberEmail(validLogin.email, false, storage))
})

test("auth components render the existing layout and accessible form controls", async () => {
  const { createServer } = await import("vite")
  const { default: react } = await import("@vitejs/plugin-react")
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: "custom" })
  try {
    const { AuthPage } = await server.ssrLoadModule("/src/components/auth/AuthPage.tsx")
    const { RegistrationForm } = await server.ssrLoadModule("/src/components/auth/RegistrationForm.tsx")
    const login = renderToStaticMarkup(createElement(AuthPage, { onLogin() {}, onRegister() {}, onGuest() {}, illustration: null, shield: null }))
    assert.match(login, /auth-layout module-auth/)
    assert.match(login, /Remember Me/)
    assert.match(login, /Continue as Guest/)
    assert.match(login, /type="password"/)
    assert.match(login, /aria-label="Show password"/)
    assert.match(login, /autoComplete="current-password"/)
    const registration = renderToStaticMarkup(createElement(RegistrationForm, { onRegister() {} }))
    for (const name of ["fullName", "email", "password", "confirmPassword", "userType", "terms"])
      assert.ok(registration.includes(`name="${name}"`), name)
    assert.match(registration, /Account information/)
    assert.match(registration, /I understand how my account information is stored/)
    assert.match(registration, /aria-label="Show confirm password"/)
    assert.match(registration, /autoComplete="new-password"/)
  } finally {
    await server.close()
  }
})
