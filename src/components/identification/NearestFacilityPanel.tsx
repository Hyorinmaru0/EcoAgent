import type { FacilityRecommendation } from "./facilityRecommendations.mjs"
import type { LocationStatus, UserLocation } from "./useUserLocation"
import "./nearest-facility.css"

type Props = {
  category: string
  recommendations: FacilityRecommendation[]
  position: UserLocation | null
  status: LocationStatus
  error: string
  onLocate: () => void
  onDirectory: () => void
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function mapUrl(facility: FacilityRecommendation) {
  const { latitude, longitude } = facility.coordinates!
  const params = new URLSearchParams({
    bbox: [longitude - 0.008, latitude - 0.005, longitude + 0.008, latitude + 0.005].join(","),
    layer: "mapnik", marker: `${latitude},${longitude}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params}`
}

function directionsUrl(facility: FacilityRecommendation, position: UserLocation) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1", origin: `${position.latitude},${position.longitude}`,
    destination: `${facility.coordinates!.latitude},${facility.coordinates!.longitude}`,
  })}`
}

export function NearestFacilityPanel({ category, recommendations, position, status, error, onLocate, onDirectory }: Props) {
  const mapped = recommendations.filter((facility) => facility.distanceKm !== null && facility.coordinates)
  const nearest = mapped[0]
  const unmappedCount = recommendations.filter((facility) => !facility.coordinates).length
  return (
    <section className="panel nearest-facility" aria-label="Nearest e-waste facility">
      <div className="nearest-facility-heading">
        <div>
          <span className="eyebrow">CLOSE TO YOU</span>
          <h2>Nearest e-waste facility</h2>
        </div>
        {category && <span className="badge badge-blue">{category}</span>}
      </div>
      {!category ? (
        <p>Select your item category in Identify E-Waste to find matching collection options.</p>
      ) : (
        <>
          <div className="nearest-location-status">
            <p role="status">{status === "loading"
              ? "Finding your current location…"
              : position
                ? "Collection options are ordered by distance from your current location."
                : "Use your current location to find the closest collection option for your device."}</p>
            <button type="button" className="btn btn-secondary" onClick={onLocate} disabled={status === "loading"}>
              {status === "loading" ? "Locating…" : position ? "Refresh my location" : "Use my location"}
            </button>
          </div>
          {error && <p className="nearest-location-error" role="alert">{error}</p>}
          {position && position.accuracy > 1000 && (
            <p className="nearest-location-error">Your location is approximate (within about {formatDistance(position.accuracy / 1000)}). Nearby options may change with a more accurate location.</p>
          )}
          {position && nearest && (
            <>
              <div className="nearest-facility-summary">
                <span className="badge badge-green">NEAREST MAPPED OPTION</span>
                <h3>{nearest.name}</h3>
                <p>{nearest.municipality} · {formatDistance(nearest.distanceKm!)} away in a straight line</p>
                <p className={nearest.acceptanceLabel.startsWith("Potential") ? "facility-acceptance-caution" : "facility-acceptance-listed"}>{nearest.acceptanceLabel}</p>
                <p>{nearest.status}</p>
                {nearest.address && <p>{nearest.address}</p>}
                <a className="collection-directions-link" href={directionsUrl(nearest, position)} target="_blank" rel="noreferrer">Get directions ↗</a>
              </div>
              <iframe className="nearest-facility-map" title={`Map showing the nearest listed facility: ${nearest.name}`} src={mapUrl(nearest)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
              <p className="nearest-map-note">The pin marks the venue. Confirm the exact drop-off point and device acceptance before visiting. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p>
              {mapped.length > 1 && (
                <div className="nearest-other-options">
                  <h3>Other nearby options</h3>
                  <ol>
                    {mapped.slice(1).map((facility) => (
                      <li key={`${facility.municipality}-${facility.name}`}>
                        <div><strong>{facility.name}</strong><span>{facility.municipality} · {formatDistance(facility.distanceKm!)} away</span><small>{facility.acceptanceLabel}</small></div>
                        <a className="collection-directions-link" href={directionsUrl(facility, position)} target="_blank" rel="noreferrer" aria-label={`Get directions to ${facility.name}`}>Directions ↗</a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
          {position && !nearest && <p role="status">No mapped collection option is available for {category}. Check the full directory for listings that need location confirmation.</p>}
          {position && unmappedCount > 0 && <p className="nearest-map-note">{unmappedCount} matching {unmappedCount === 1 ? "listing has" : "listings have"} no confirmed map coordinates and {unmappedCount === 1 ? "is" : "are"} excluded from the distance ranking.</p>}
        </>
      )}
      <p className="nearest-map-note">Distances are straight-line estimates, not road distances or travel times. Location is used in this browser and is not stored in your profile. The directory covers listed Metro Manila venues; confirm current collection arrangements.</p>
      <button type="button" className="btn btn-secondary" onClick={onDirectory}>Browse full directory</button>
    </section>
  )
}
