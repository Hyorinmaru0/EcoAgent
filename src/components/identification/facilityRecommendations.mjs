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

export function isValidCoordinates(point) {
  return Boolean(point) && Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
}

export function distanceKmBetween(from, to) {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) return null
  const radians = (degrees) => degrees * Math.PI / 180
  const deltaLat = radians(to.latitude - from.latitude)
  const deltaLon = radians(to.longitude - from.longitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(from.latitude)) *
    Math.cos(radians(to.latitude)) * Math.sin(deltaLon / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
}

export function getFacilityRecommendations(locations, category, userLocation = null) {
  const terms = itemTerms[category]
  if (!terms) return []

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
      distanceKm: distanceKmBetween(userLocation, location.coordinates),
    }]
  }))

  return matches.sort((a, b) => {
    const distance = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    if (!Number.isNaN(distance) && distance !== 0) return distance
    const aNeedsConfirmation = a.acceptanceLabel.startsWith("Potential")
    const bNeedsConfirmation = b.acceptanceLabel.startsWith("Potential")
    return Number(aNeedsConfirmation) - Number(bNeedsConfirmation) ||
      a.municipality.localeCompare(b.municipality) ||
      a.name.localeCompare(b.name)
  })
}
