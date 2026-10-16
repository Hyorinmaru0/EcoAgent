import collectionLocations from "../data/collection-locations.json" with {
  type: "json",
}

const facilities = [
  {
    name: "GreenTech Recycling Center",
    location: "Quezon City",
    items: ["laptops", "desktop computers", "mobile phones", "chargers"],
    days: "Monday–Friday",
    hours: "9:00 AM–5:00 PM",
  },
  {
    name: "Eco Recovery Hub",
    location: "Marikina City",
    items: ["mobile phones", "batteries", "chargers", "small electronics"],
    days: "Monday–Saturday",
    hours: "9:00 AM–6:00 PM",
  },
  {
    name: "Circular Electronics Center",
    location: "Pasig City",
    items: ["laptops", "desktop computers", "computer parts", "mobile phones"],
    days: "Tuesday–Saturday",
    hours: "8:30 AM–4:30 PM",
  },
]

const itemGuides = [
  {
    name: "computer equipment",
    pattern: /\b(laptops?|notebooks?|desktops?|computers?|pcs?|tablets?)\b/i,
    hazard:
      "It may contain a rechargeable battery and electronic components that need special handling. The exact hazards depend on the device.",
    handling:
      "Keep it separate from household rubbish, avoid dismantling it, and back up and erase personal data when safe. Check a facility's accepted-item requirements before visiting.",
    facilityTerms: ["laptops", "desktop computers", "computer parts"],
  },
  {
    name: "mobile phone",
    pattern: /\b(mobile phones?|cell ?phones?|smartphones?)\b/i,
    hazard:
      "It may contain a rechargeable battery and electronic components; the exact hazards depend on the device.",
    handling:
      "Keep it separate from household rubbish. Back up and erase personal data when safe, and do not open or puncture the battery.",
    facilityTerms: ["mobile phones"],
  },
  {
    name: "battery",
    pattern: /\b(batteries|battery|lithium[- ]ion|li-?ion)\b/i,
    hazard:
      "Batteries may require special handling; damaged, swollen, hot, or leaking batteries need extra caution.",
    handling:
      "Do not crush, puncture, open, or burn a battery. Keep it away from heat and ask a suitable collection facility how it should be stored and transported. If it is smoking or burning, move away and contact local emergency services.",
    facilityTerms: ["batteries"],
  },
  {
    name: "charger",
    pattern: /\b(chargers?|power adapters?|adapters?)\b/i,
    hazard:
      "A charger is electronic waste. Its components and any attached battery can require separate handling.",
    handling:
      "Do not put it in household rubbish or dismantle it. Check whether a collection facility accepts chargers.",
    facilityTerms: ["chargers"],
  },
  {
    name: "small electronics",
    pattern: /\b(screens?|monitors?|televisions?|tvs|circuit boards?|printers?|cables?)\b/i,
    hazard:
      "Some electronic components can contain hazardous substances; the classification depends on the product type.",
    handling:
      "Keep the item intact and separate from household rubbish. Avoid dismantling it and ask a collection facility about its requirements.",
    facilityTerms: ["small electronics", "computer parts"],
  },
]

const response = (topic, answer) => ({ topic, answer })

export function createEcoBotAnswer(question) {
  const text = question.trim()
  const item = itemGuides.find((guide) => guide.pattern.test(text))
  const normalizedText = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  const cityAliases = new Map([["qc", "quezon city"]])
  const city = collectionLocations.find((entry) => {
    const municipality = entry.municipality
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
    const alias = cityAliases.get(normalizedText.trim())
    return (
      normalizedText.includes(municipality) ||
      (alias === municipality && /\bqc\b/.test(normalizedText))
    )
  })
  const asksAboutFacilities =
    /\b(facilit|collection points?|directory|where|locations?|address|accept|accepted|drop.?off|bring|visit|hours?|schedule|open)\b/i.test(
      text,
    )
  const asksAboutCollectionLocations =
    /\b(collection|drop.?off|e-?waste|electronic waste|dispos|recycl|locations?|where|points?|bin)\b/i.test(
      text,
    )

  if (/^(hi|hello|hey|good morning|good afternoon)\b/i.test(text)) {
    return response(
      "welcome",
      "Hello! Ask me about an electronic item's category, possible hazards, safe handling, reuse, or the facility information shown on this site.",
    )
  }

  if (
    /\b(smok(?:e|ing)|on fire|burning|flames?)\b/i.test(text) &&
    /\b(battery|device|phone|laptop|electronics?)\b/i.test(text)
  ) {
    return response(
      "urgent-safety",
      "Move away from a smoking or burning device and contact local emergency services. Do not handle or transport it. Follow emergency responders' instructions.",
    )
  }

  if (city && asksAboutCollectionLocations) {
    const points = city.locations.map(
      (location) =>
        `${location.name} (${location.operator}): ${location.status}`,
    )
    const details = [
      city.status,
      ...points,
      city.note,
    ].filter(Boolean)
    return response(
      "community-collection-locations",
      `${city.municipality}: ${details.join(" ")} These entries are based on information provided for this project, not independently verified. Confirm current operation, public access, accepted items, and schedules before traveling.`,
    )
  }

  if (!city && asksAboutCollectionLocations && /\b(?:in|near)\s+[\p{L}\s-]+/iu.test(text)) {
    return response(
      "collection-location-not-listed",
      "I don't have a collection location listed for that municipality in this directory. Check with your local environment office for current options.",
    )
  }

  if (asksAboutCollectionLocations && asksAboutFacilities && !item) {
    const listings = collectionLocations.map((entry) => {
      const points = entry.locations.map(
        (location) => `${location.name} (${location.operator})`,
      )
      return `${entry.municipality}: ${points.length ? points.join("; ") + ". " + entry.locations.map((location) => location.status).join("; ") : `${entry.status} ${entry.note ?? ""}`}`
    })
    return response(
      "community-collection-locations",
      `${listings.join(" ")} These entries are based on information provided for this project, not independently verified. Confirm current operation, public access, accepted items, and schedules before traveling.`,
    )
  }

  if (asksAboutFacilities) {
    const matches = item
      ? facilities.filter((facility) =>
          facility.items.some((accepted) =>
            item.facilityTerms.includes(accepted),
          ),
        )
      : facilities

    const listings = matches.map(
      (facility) =>
        `${facility.name} in ${facility.location} lists ${facility.items.join(", ")}; ${facility.days}, ${facility.hours}`,
    )
    const itemNote = item
      ? ` These are the site's sample matches for ${item.name}.`
      : ""

    return response(
      "facility-directory",
      `${listings.length ? listings.join(". ") + "." : "The site does not list a matching sample facility for that item."}${itemNote} All facility entries on this site are illustrative examples, not verified real-world listings. Confirm acceptance, address, and schedule directly with a facility before traveling.`,
    )
  }

  if (/\b(reuse|repair|donat|still works|working device)\b/i.test(text)) {
    return response(
      "reuse-and-recycling",
      "If an electronic device still works, repair, reuse, or donation may extend its useful life. When reuse is no longer suitable, check a collection facility's accepted-item requirements and verify its information directly.",
    )
  }

  if (item) {
    return response(
      "item-guidance",
      `Category: ${item.name}. Hazard classification: ${item.hazard} Handling guidance: ${item.handling}`,
    )
  }

  if (
    /\b(environment|pollution|impact|soil|waterways)\b|why.*\b(recycl|dispos)/i.test(
      text,
    )
  ) {
    return response(
      "environment",
      "Responsible e-waste handling helps keep hazardous substances out of soil and waterways and allows useful materials to be recovered. Keep electronics separate from household rubbish and use a collection option that confirms it accepts your item.",
    )
  }

  if (/\b(accessib|keyboard|disabilit|screen reader|website|system|what can you do)\b/i.test(text)) {
    return response(
      "about-this-site",
      "This site provides e-waste handling guidance, educational information, and a directory of sample collection facilities. EcoBot answers from that project content. The facility records are illustrative and should be verified directly.",
    )
  }

  if (/\b(dispos|recycl|throw away|unwanted electronics?|e-?waste|electronic waste)\b/i.test(text)) {
    return response(
      "general-disposal",
      "Keep unwanted electronics separate from household rubbish, avoid dismantling them, and check the facility directory for a collection point that accepts the item. The facilities listed here are illustrative examples; verify details directly before visiting. Tell me the item name for more specific handling guidance.",
    )
  }

  return response(
    "clarification",
    "I can answer questions about e-waste categories, possible hazards, safe handling, reuse and recycling, and the sample facility directory on this site. What item or topic would you like help with?",
  )
}

class ApiRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0

  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) {
      throw new ApiRequestError(413, "Request body is too large.")
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new ApiRequestError(400, "Request body must be valid JSON.")
  }
}

async function handleEcoBotRequest(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    sendJson(res, 405, { error: "Use POST to send a question to EcoBot." })
    return
  }

  if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "Content-Type must be application/json." })
    return
  }

  const body = await readJsonBody(req)
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.message !== "string"
  ) {
    throw new ApiRequestError(400, "Provide a question in the message field.")
  }

  const question = body.message.trim()
  if (!question) {
    throw new ApiRequestError(400, "Enter a question for EcoBot.")
  }
  if (question.length > 500) {
    throw new ApiRequestError(400, "Questions must be 500 characters or fewer.")
  }

  sendJson(res, 200, createEcoBotAnswer(question))
}

export function ecoBotMiddleware(req, res, next) {
  const pathname = (req.url || "").split("?")[0]
  if (pathname === "/api/health") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET")
      sendJson(res, 405, { error: "Use GET to check the EcoBot API." })
      return
    }
    sendJson(res, 200, { status: "ok", service: "EcoBot project knowledge API" })
    return
  }

  if (pathname !== "/api/chat") {
    next()
    return
  }

  handleEcoBotRequest(req, res).catch((error) => {
    if (error instanceof ApiRequestError) {
      sendJson(res, error.status, { error: error.message })
      return
    }

    console.error("EcoBot API request failed:", error)
    sendJson(res, 500, { error: "EcoBot could not process that request." })
  })
}
