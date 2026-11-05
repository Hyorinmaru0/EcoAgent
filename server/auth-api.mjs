import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { database, getCollectionLocations } from "./facility-database.mjs"

const scrypt = promisify(scryptCallback)
const developmentSessionCookie = "ecocycle_session"
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const allowedUserTypes = new Set(["Student", "Household", "General User"])
const attempts = new Map()
const dummySalt = "71d9f1a9f945b13d92eef478fa2af771"
const dummyHash = Buffer.alloc(64)
let activeHashOperations = 0

database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now())
database.exec(`
  CREATE TABLE IF NOT EXISTS account_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    location TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS account_items (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_key TEXT NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL, condition TEXT NOT NULL,
    quantity INTEGER NOT NULL, analysis_kind TEXT NOT NULL, photo_condition TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, client_key)
  );
  CREATE TABLE IF NOT EXISTS account_saved_facilities (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, facility_id)
  );
`)

class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
    throw new AuthError(415, "Send account details as JSON.")
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const value = Buffer.from(chunk)
    size += value.length
    if (size > 16_384) throw new AuthError(413, "The account request is too large.")
    chunks.push(value)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object")
    return value
  } catch {
    throw new AuthError(400, "The account request is invalid.")
  }
}

function enforceSameOrigin(req) {
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) throw new Error("Origin mismatch")
    } catch {
      throw new AuthError(403, "This account request was not accepted.")
    }
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    throw new AuthError(403, "This account request was not accepted.")
  }
}

function checkRateLimit(req, email) {
  const now = Date.now()
  const ip = req.socket.remoteAddress || "unknown"
  const keys = [`ip:${ip}`, `account:${ip}:${email}`]
  const limits = [40, 10]
  for (let index = 0; index < keys.length; index += 1) {
    const item = attempts.get(keys[index])
    if (item && item.until > now && item.count >= limits[index]) {
      throw new AuthError(429, "Too many account attempts. Please wait 15 minutes and try again.")
    }
  }
  for (const key of keys) {
    const item = attempts.get(key)
    if (!item || item.until <= now) attempts.set(key, { count: 1, until: now + 15 * 60 * 1000 })
    else item.count += 1
  }
  if (attempts.size > 5000) {
    for (const [attemptKey, value] of attempts) if (value.until <= now) attempts.delete(attemptKey)
  }
  return keys
}

function clearRateLimit(keys) {
  attempts.delete(keys[1])
}

async function derivePassword(password, salt) {
  if (activeHashOperations >= 4) throw new AuthError(429, "The account service is busy. Please try again shortly.")
  activeHashOperations += 1
  try {
    return Buffer.from(await scrypt(password, salt, 64, { N: 32_768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 }))
  } finally {
    activeHashOperations -= 1
  }
}

function cookieName(req) {
  return process.env.NODE_ENV === "production" || Boolean(req.socket.encrypted)
    ? "__Host-ecocycle_session"
    : developmentSessionCookie
}

function sessionCookieValue(req, token, maxAgeSeconds) {
  const secure = cookieName(req).startsWith("__Host-")
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`
}

function clearSessionCookie(req) {
  return sessionCookieValue(req, "", 0)
}

function sessionToken(req) {
  const name = cookieName(req)
  const cookies = (req.headers.cookie || "").split(";")
  const item = cookies.find((part) => part.trim().startsWith(`${name}=`))
  return item ? item.trim().slice(name.length + 1) : ""
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex")
}

function publicUser(row) {
  const preference = database.prepare("SELECT location FROM account_preferences WHERE user_id = ?").get(row.id)
  return { id: row.id, fullName: row.full_name, email: row.email, userType: row.user_type, location: preference?.location || "" }
}

function currentUser(req) {
  const token = sessionToken(req)
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const row = database.prepare(`
    SELECT users.id, users.full_name, users.email, users.user_type
    FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
  `).get(tokenHash(token), Date.now())
  return row ? publicUser(row) : null
}

async function createSession(req, res, user) {
  const token = randomBytes(32).toString("hex")
  const expiry = Date.now() + sessionLifetimeMs
  database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now())
  database.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash(token), user.id, expiry)
  res.setHeader("Set-Cookie", sessionCookieValue(req, token, Math.floor(sessionLifetimeMs / 1000)))
}

async function handle(req, res, pathname) {
  if (pathname.startsWith("/api/account/")) {
    const user = currentUser(req)
    if (!user) throw new AuthError(401, "Sign in to save and access your account data.")
    if (req.headers["x-ecocycle-account"] && req.headers["x-ecocycle-account"] !== String(user.id)) {
      throw new AuthError(409, "Your signed-in account changed in another tab. Reload this page before continuing.")
    }
    if (pathname === "/api/account/data") {
      if (req.method !== "GET") return json(res, 405, { error: "Use GET to load account data." })
      return json(res, 200, accountData(user.id))
    }
    if (req.method !== "POST") return json(res, 405, { error: "Use POST for this account action." })
    enforceSameOrigin(req)
    const body = await readBody(req)
    const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : ""
    if (pathname === "/api/account/profile") {
      const name = text(body.fullName, 101), location = text(body.location, 201)
      if (name.length < 2 || name.length > 100 || location.length > 200 || !allowedUserTypes.has(body.userType)) {
        throw new AuthError(400, "Enter a valid name, user type, and location (up to 200 characters).")
      }
      database.exec("BEGIN IMMEDIATE")
      try {
        database.prepare("UPDATE users SET full_name = ?, user_type = ? WHERE id = ?").run(name, body.userType, user.id)
        database.prepare("INSERT INTO account_preferences (user_id, location) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET location = excluded.location").run(user.id, location)
        database.exec("COMMIT")
      } catch (error) { database.exec("ROLLBACK"); throw error }
      return json(res, 200, { user: currentUser(req) })
    }
    if (pathname === "/api/account/items") {
      const name = text(body.name, 121)
      if (!name || name.length > 120 || !["TV", "Mobile Phone", "Laptop"].includes(body.category) ||
          !["Working", "Damaged", "Broken", "Unknown"].includes(body.condition) ||
          !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100 ||
          !/^[a-f0-9-]{36}$/i.test(body.clientKey || "") || !["manual", "photo"].includes(body.analysisKind)) {
        throw new AuthError(400, "Enter a supported device, condition, quantity (1-100), and valid analysis record.")
      }
      database.prepare(`INSERT INTO account_items
        (user_id, client_key, name, category, condition, quantity, analysis_kind, photo_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, client_key) DO NOTHING`)
        .run(user.id, body.clientKey, name, body.category, body.condition, body.quantity, body.analysisKind,
          body.analysisKind === "photo" ? text(body.photoCondition, 200) : null)
    } else if (pathname === "/api/account/items/remove") {
      if (!Number.isSafeInteger(body.id) || body.id < 1) throw new AuthError(400, "Choose a valid saved item.")
      const result = database.prepare("DELETE FROM account_items WHERE id = ? AND user_id = ?").run(body.id, user.id)
      if (!result.changes) throw new AuthError(404, "Saved item not found in your account.")
    } else if (pathname === "/api/account/facilities/toggle") {
      const facility = database.prepare("SELECT id FROM facilities WHERE municipality = ? AND name = ?")
        .get(text(body.municipality, 200), text(body.name, 200))
      if (!facility) throw new AuthError(404, "Choose a facility from the directory.")
      if (typeof body.saved !== "boolean") throw new AuthError(400, "Specify whether to save this facility.")
      if (body.saved) database.prepare("INSERT OR IGNORE INTO account_saved_facilities (user_id, facility_id) VALUES (?, ?)").run(user.id, facility.id)
      else database.prepare("DELETE FROM account_saved_facilities WHERE user_id = ? AND facility_id = ?").run(user.id, facility.id)
    } else throw new AuthError(404, "Account action not found.")
    return json(res, 200, accountData(user.id))
  }
  if (pathname === "/api/auth/me") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET")
      return json(res, 405, { error: "Use GET to check the current account." })
    }
    return json(res, 200, { user: currentUser(req) })
  }

  if (!["/api/auth/register", "/api/auth/login", "/api/auth/logout"].includes(pathname)) return false
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return json(res, 405, { error: "Use POST for this account action." })
  }
  enforceSameOrigin(req)
  const body = await readBody(req)

  if (pathname === "/api/auth/logout") {
    const token = sessionToken(req)
    if (/^[a-f0-9]{64}$/.test(token)) database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash(token))
    res.setHeader("Set-Cookie", clearSessionCookie(req))
    return json(res, 200, { ok: true })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, "Enter a valid email address.")
  }
  const attemptKeys = checkRateLimit(req, email)

  if (pathname === "/api/auth/register") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""
    const userType = typeof body.userType === "string" ? body.userType : ""
    const password = typeof body.password === "string" ? body.password : ""
    if (fullName.length < 2 || fullName.length > 100) throw new AuthError(400, "Enter a name between 2 and 100 characters.")
    if (!allowedUserTypes.has(userType)) throw new AuthError(400, "Select a valid user type.")
    if (password.length < 8 || password.length > 128 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
      throw new AuthError(400, "Use a password with 8–128 characters, including a letter and a number.")
    }
    const salt = randomBytes(16)
    const hash = await derivePassword(password, salt)
    let result
    try {
      result = database.prepare(`
        INSERT INTO users (full_name, email, user_type, password_salt, password_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(fullName, email, userType, salt.toString("hex"), Buffer.from(hash).toString("hex"))
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: users.email")) {
        throw new AuthError(409, "An account with this email already exists. Try logging in instead.")
      }
      throw error
    }
    const user = { id: Number(result.lastInsertRowid), full_name: fullName, email, user_type: userType }
    await createSession(req, res, user)
    clearRateLimit(attemptKeys)
    return json(res, 201, { user: publicUser(user) })
  }

  const row = database.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email)
  const salt = row ? Buffer.from(row.password_salt, "hex") : Buffer.from(dummySalt, "hex")
  const expected = row ? Buffer.from(row.password_hash, "hex") : dummyHash
  const password = typeof body.password === "string" ? body.password : ""
  const actual = await derivePassword(password, salt)
  if (password.length > 128 || !row || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AuthError(401, "Email or password is incorrect.")
  }
  await createSession(req, res, row)
  clearRateLimit(attemptKeys)
  return json(res, 200, { user: publicUser(row) })
}

export function authApiMiddleware(req, res, next) {
  const pathname = (req.url || "").split("?")[0]
  const routes = ["/api/auth/me", "/api/auth/register", "/api/auth/login", "/api/auth/logout"]
  if (!routes.includes(pathname) && !pathname.startsWith("/api/account/")) return next()
  handle(req, res, pathname).catch((error) => {
    if (error instanceof AuthError) return json(res, error.status, { error: error.message })
    console.error("Account API failed:", error)
    return json(res, 500, { error: "Account service is temporarily unavailable." })
  })
}

function accountData(userId) {
  const items = database.prepare(`SELECT id, client_key AS clientKey, name, category, condition,
    quantity, analysis_kind AS analysisKind, photo_condition AS photoCondition, created_at AS createdAt
    FROM account_items WHERE user_id = ? ORDER BY id DESC`).all(userId)
  const rows = database.prepare(`SELECT f.municipality, f.name FROM facilities f
    JOIN account_saved_facilities s ON s.facility_id = f.id WHERE s.user_id = ?`).all(userId)
  const keys = new Set(rows.map((row) => JSON.stringify([row.municipality, row.name])))
  const savedFacilities = getCollectionLocations().flatMap((area) => area.locations
    .filter((facility) => keys.has(JSON.stringify([area.municipality, facility.name])))
    .map((facility) => ({ ...facility, municipality: area.municipality })))
  return { items, savedFacilities }
}
