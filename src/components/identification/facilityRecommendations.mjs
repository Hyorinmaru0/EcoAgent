function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

const itemTerms = {
  TV: ["television", " tv"],
  "Mobile Phone": ["mobile phone", "cell phone", "phone"],
  Laptop: ["laptop"],
}

function locationMatches(municipality, requestedLocation) {
  const place = normalize(requestedLocation.trim())
  const city = normalize(municipality)
  return Boolean(place) && (place === city || place.includes(city) || city.includes(place))
}

export function getFacilityRecommendations(locations, category, requestedLocation) {
  const terms = itemTerms[category]
  if (!terms || !requestedLocation.trim()) return []

  const matches = locations.flatMap((entry) => entry.locations.flatMap((location) => {
    const listedDevices = normalize(location.acceptedDevices)
    const status = normalize(location.status)
    const explicitlyListed = terms.some((term) => listedDevices.includes(term))
    const confirmedInStatus = terms.some((term) => status.includes(term))
    if (!explicitlyListed && !confirmedInStatus) return []

    return [{
      ...location,
      municipality: entry.municipality,
      acceptanceLabel: explicitlyListed
        ? `Listed acceptance: ${location.acceptedDevices}`
        : `Potential match for ${category} — confirm acceptance with the facility`,
      isLocal: locationMatches(entry.municipality, requestedLocation),
    }]
  }))

  const localMatches = matches.filter((location) => location.isLocal)
  const recommendations = localMatches.length ? localMatches : matches
  return recommendations.sort((a, b) => {
    const aNeedsConfirmation = a.acceptanceLabel.startsWith("Potential")
    const bNeedsConfirmation = b.acceptanceLabel.startsWith("Potential")
    return Number(aNeedsConfirmation) - Number(bNeedsConfirmation) ||
      a.municipality.localeCompare(b.municipality) ||
      a.name.localeCompare(b.name)
  })
}
