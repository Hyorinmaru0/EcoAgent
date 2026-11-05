import { getCollectionLocations } from "./facility-database.mjs"

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify(body))
}

export function facilityApiMiddleware(req, res, next) {
  const pathname = (req.url || "").split("?")[0]
  if (pathname !== "/api/facilities") return next()
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return sendJson(res, 405, { error: "Facility records are currently read-only." })
  }
  try {
    return sendJson(res, 200, { facilities: getCollectionLocations() })
  } catch (error) {
    console.error("Facility API failed:", error)
    return sendJson(res, 500, { error: "Facility data is temporarily unavailable." })
  }
}
