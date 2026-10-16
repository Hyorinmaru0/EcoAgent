import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createServer } from "node:http"
import { ecoBotMiddleware } from "../server/ecobot.mjs"

let server
let baseUrl

before(async () => {
  server = createServer((req, res) =>
    ecoBotMiddleware(req, res, () => {
      res.statusCode = 404
      res.end()
    }),
  )
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

describe("EcoBot project knowledge API", () => {
  it("answers item hazard and safe-handling questions", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How do I handle a damaged battery?" }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.equal(body.topic, "item-guidance")
    assert.match(body.answer, /special handling/i)
    assert.match(body.answer, /do not crush, puncture, open, or burn/i)
  })

  it("answers facility questions with site schedules and an illustrative-data warning", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Where can I take my laptop?" }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.equal(body.topic, "facility-directory")
    assert.match(body.answer, /GreenTech Recycling Center in Quezon City/)
    assert.match(body.answer, /Monday–Friday, 9:00 AM–5:00 PM/)
    assert.match(body.answer, /illustrative examples/i)
  })

  it("answers municipality-specific collection questions with the provided status", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Where are e-waste collection locations in Malabon?",
      }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.equal(body.topic, "community-collection-locations")
    assert.match(body.answer, /Barangay Dampalit community e-waste facility project/)
    assert.match(body.answer, /confirm current operation and public drop-off access/i)
    assert.match(body.answer, /not independently verified/i)
  })

  it("does not return unlisted no-drop-off municipalities as collection locations", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Is there an e-waste drop-off location in Navotas?",
      }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.equal(body.topic, "collection-location-not-listed")
    assert.match(body.answer, /don't have a collection location listed/i)
  })

  it("lists the provided collection options across Metro Manila", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Please provide e-waste collection locations." }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.match(body.answer, /Caloocan: SM City Grand Central/)
    assert.match(body.answer, /Quezon City: SM North EDSA/)
    assert.match(body.answer, /Parañaque: SM City BF Parañaque/)
    assert.doesNotMatch(body.answer, /\b(?:Navotas|Pateros)\b/)
    assert.doesNotMatch(body.answer, /No permanent public e-waste drop-off point verified/)
  })

  it("answers environmental and reuse questions from the site's educational content", async () => {
    const environment = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Why is proper e-waste recycling important?" }),
    })
    const reuse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Can I reuse a working phone?" }),
    })

    assert.match((await environment.json()).answer, /soil and waterways/i)
    assert.match((await reuse.json()).answer, /repair, reuse, or donation/i)
  })

  it("returns a useful clarification instead of inventing unsupported answers", async () => {
    const result = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Who won the football match?" }),
    })
    const body = await result.json()

    assert.equal(result.status, 200)
    assert.equal(body.topic, "clarification")
    assert.match(body.answer, /e-waste categories/i)
  })

  it("validates request method, content type, and question", async () => {
    const wrongMethod = await fetch(`${baseUrl}/api/chat`)
    const wrongType = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      body: "message=hello",
    })
    const emptyQuestion = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: " " }),
    })

    assert.equal(wrongMethod.status, 405)
    assert.equal(wrongType.status, 415)
    assert.equal(emptyQuestion.status, 400)
  })

  it("exposes a health endpoint", async () => {
    const result = await fetch(`${baseUrl}/api/health`)
    assert.equal(result.status, 200)
    assert.equal((await result.json()).status, "ok")
  })
})
