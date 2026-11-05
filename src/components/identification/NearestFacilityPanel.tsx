import type { FacilityRecommendation } from "./facilityRecommendations.mjs"
import type { LocationChoice, LocationStatus, UserLocation } from "./useUserLocation"
import { NearestFacilityMap } from "./NearestFacilityMap"
import "./nearest-facility.css"

type Props = {
  category: string
  recommendations: FacilityRecommendation[]
  position: UserLocation | null
  status: LocationStatus
  error: string
  onLocate: () => void
  locationChoices: LocationChoice[]
  onApproximateLocation: (choice: LocationChoice) => void
  onDirectory: () => void
  onDetails: (facility: FacilityRecommendation) => void
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function formatAccuracy(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function directionsUrl(facility: FacilityRecommendation, position: UserLocation) {
  const params = new URLSearchParams({
    api: "1",
    origin: `${position.latitude},${position.longitude}`,
    destination: `${facility.coordinates!.latitude},${facility.coordinates!.longitude}`,
  })
  return `https://www.google.com/maps/dir/?${params}`
}

export function NearestFacilityPanel({
  category,
  recommendations,
  position,
  status,
  error,
  onLocate,
  locationChoices,
  onApproximateLocation,
  onDirectory,
  onDetails,
}: Props) {
  const isApproximate = position?.source === "approximate"
  const mapped = position
    ? recommendations.filter((facility) => facility.coordinates && facility.distanceKm !== null)
    : []
  const nearest = mapped[0] ?? null
  const otherOptions = mapped.slice(1)
  const unmappedCount = recommendations.filter((facility) => !facility.coordinates).length

  return (
    <section id="nearest-facility-panel" className="panel nearest-facility" aria-label="Nearest e-waste facility">
      <div className="nearest-facility-heading">
        <div>
          <span className="eyebrow">CLOSE TO YOU</span>
          <h2>Nearest e-waste facility</h2>
        </div>
        {category && <span className="badge badge-blue">{category}</span>}
      </div>

      {!category ? (
        <p>Select an item category to find facilities that list acceptance for that device.</p>
      ) : (
        <>
          <div className="nearest-location-status">
            <p role="status">
              {status === "loading"
                ? "Waiting for your device location. This can take up to 45 seconds..."
                : position
                  ? isApproximate
                    ? `Showing a rough estimate for ${position.municipality}.`
                    : `Using your device location, reported accurate to about ${formatAccuracy(position.accuracy)}.`
                  : "Your device location is needed to rank facilities by distance."}
            </p>
            <button type="button" className="btn btn-secondary" onClick={onLocate} disabled={status === "loading"}>
              {status === "loading" ? "Waiting for location..." : position ? "Refresh my location" : "Use my location"}
            </button>
          </div>

          {error && <p className="nearest-location-error" role="alert">{error}</p>}

          {locationChoices.length > 0 && (
            <div className="nearest-approximate-location">
              <label htmlFor="nearest-location-choice">If the device cannot provide a location, select a city for a rough estimate.</label>
              <select
                id="nearest-location-choice"
                value={isApproximate ? position?.municipality ?? "" : ""}
                onChange={(event) => {
                  const selected = locationChoices.find((choice) => choice.municipality === event.target.value)
                  if (selected) onApproximateLocation(selected)
                }}
              >
                <option value="">Choose a municipality</option>
                {locationChoices.map((choice) => <option key={choice.municipality} value={choice.municipality}>{choice.municipality}</option>)}
              </select>
            </div>
          )}

          {nearest ? (
            <>
              <div className="nearest-facility-summary">
                <span className="badge badge-green">
                  {isApproximate ? "ROUGH CITY ESTIMATE" : (position?.accuracy ?? Infinity) <= 250 ? "NEAREST MAPPED OPTION" : "NEAREST DEVICE ESTIMATE"}
                </span>
                <h3>{nearest.name}</h3>
                <p>{nearest.municipality} · {formatDistance(nearest.distanceKm!)} away in a straight line</p>
                <p className={nearest.acceptanceLabel.startsWith("Potential") ? "facility-acceptance-caution" : "facility-acceptance-listed"}>{nearest.acceptanceLabel}</p>
                <p>{nearest.status}</p>
                {nearest.address && <p>{nearest.address}</p>}
                <button type="button" className="btn btn-primary" onClick={() => onDetails(nearest)}>View facility details</button>
                {!isApproximate && position && position.accuracy > 250 && (
                  <p className="nearest-location-error">This is the closest mapped result to the coordinates returned by your device. The {formatAccuracy(position.accuracy)} accuracy radius means the actual nearest facility may differ.</p>
                )}
                {isApproximate && <p className="nearest-map-note">The city estimate uses mapped facility locations and may not identify the closest option to your exact location.</p>}
                <a className="collection-directions-link" href={directionsUrl(nearest, position!)} target="_blank" rel="noreferrer">Get directions in Google Maps ↗</a>
              </div>

              {otherOptions.length > 0 && (
                <div className="nearest-other-options">
                  <h3>Other matching facilities</h3>
                  <ol>
                    {otherOptions.map((facility) => (
                      <li key={`${facility.municipality}-${facility.name}`}>
                        <div>
                          <strong>{facility.name}</strong>
                          <span>{facility.municipality} · {formatDistance(facility.distanceKm!)}</span>
                          <small>{facility.acceptanceLabel}</small>
                          <button type="button" className="btn btn-secondary" onClick={() => onDetails(facility)}>View facility details</button>
                        </div>
                        <a className="collection-directions-link" href={directionsUrl(facility, position!)} target="_blank" rel="noreferrer">Directions ↗</a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : position ? (
            <p role="status">No matching facility with map coordinates was found for {category}. Browse the full directory for other listings.</p>
          ) : null}

          <NearestFacilityMap position={position} facility={nearest} />

          {unmappedCount > 0 && <p className="nearest-map-note">{unmappedCount} matching {unmappedCount === 1 ? "listing has" : "listings have"} no mapped coordinates and cannot be ranked by distance.</p>}
        </>
      )}

      <p className="nearest-map-note">Distances are straight-line estimates. Facility pins mark venue coordinates, not necessarily the exact collection bin. Confirm device acceptance and collection arrangements before visiting.</p>
      <button type="button" className="btn btn-secondary" onClick={onDirectory}>Browse full directory</button>
    </section>
  )
}
