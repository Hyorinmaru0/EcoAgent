import { useEffect, useRef, useState } from "react"
import type { FacilityRecommendation } from "./facilityRecommendations.mjs"
import type { UserLocation } from "./useUserLocation"

type Props = { position: UserLocation | null; facility: FacilityRecommendation | null }
type MapStatus = "loading" | "ready" | "missing-key" | "error"

let mapsLoad: Promise<void> | null = null

function loadGoogleMaps(apiKey: string) {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve()
  if (!mapsLoad) {
    mapsLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
      script.async = true
      script.dataset.ecocycleNearestMaps = "true"
      script.onload = () => {
        if (typeof google !== "undefined" && google.maps) resolve()
        else reject(new Error("Google Maps did not initialize."))
      }
      script.onerror = () => {
        mapsLoad = null
        reject(new Error("Google Maps could not load."))
      }
      document.head.append(script)
    })
  }
  return mapsLoad
}

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
    scale: 9,
  }
}

export function NearestFacilityMap({ position, facility }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const userMarker = useRef<google.maps.Marker | null>(null)
  const facilityMarker = useRef<google.maps.Marker | null>(null)
  const accuracyCircle = useRef<google.maps.Circle | null>(null)
  const [status, setStatus] = useState<MapStatus>("loading")

  useEffect(() => {
    let cancelled = false
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
    if (!apiKey) {
      setStatus("missing-key")
      return () => { cancelled = true }
    }

    void loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !container.current) return
      map.current = new google.maps.Map(container.current, {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })
      userMarker.current = new google.maps.Marker({
        map: map.current,
        title: "Your device location",
        icon: markerIcon("#2478e5"),
        zIndex: 2,
      })
      facilityMarker.current = new google.maps.Marker({
        map: map.current,
        title: "Nearest e-waste facility",
        icon: markerIcon("#278443"),
        zIndex: 1,
      })
      accuracyCircle.current = new google.maps.Circle({
        map: map.current,
        strokeColor: "#2478e5",
        strokeOpacity: 0.55,
        strokeWeight: 1,
        fillColor: "#2478e5",
        fillOpacity: 0.12,
        clickable: false,
      })
      setStatus("ready")
    }).catch(() => {
      if (!cancelled) setStatus("error")
    })

    return () => {
      cancelled = true
      userMarker.current?.setMap(null)
      facilityMarker.current?.setMap(null)
      accuracyCircle.current?.setMap(null)
      map.current = null
      userMarker.current = null
      facilityMarker.current = null
      accuracyCircle.current = null
    }
  }, [])

  const userLat = position?.latitude
  const userLng = position?.longitude
  const accuracy = position?.accuracy
  const facilityLat = facility?.coordinates?.latitude
  const facilityLng = facility?.coordinates?.longitude

  useEffect(() => {
    if (status !== "ready" || !map.current) return
    const bounds = new google.maps.LatLngBounds()
    let pointCount = 0

    if (userLat !== undefined && userLng !== undefined) {
      const userPoint = { lat: userLat, lng: userLng }
      userMarker.current?.setPosition(userPoint)
      accuracyCircle.current?.setCenter(userPoint)
      accuracyCircle.current?.setRadius(accuracy ?? 0)
      bounds.extend(userPoint)
      pointCount += 1
    } else {
      userMarker.current?.setPosition(null)
      accuracyCircle.current?.setCenter(null)
    }

    if (facilityLat !== undefined && facilityLng !== undefined) {
      const facilityPoint = { lat: facilityLat, lng: facilityLng }
      facilityMarker.current?.setPosition(facilityPoint)
      bounds.extend(facilityPoint)
      pointCount += 1
    } else {
      facilityMarker.current?.setPosition(null)
    }

    if (pointCount > 1) {
      map.current.fitBounds(bounds, 64)
      map.current.setOptions({ maxZoom: 16 })
    } else if (userLat !== undefined && userLng !== undefined) {
      map.current.setCenter({ lat: userLat, lng: userLng })
      map.current.setZoom(15)
    } else if (facilityLat !== undefined && facilityLng !== undefined) {
      map.current.setCenter({ lat: facilityLat, lng: facilityLng })
      map.current.setZoom(15)
    }
  }, [status, userLat, userLng, accuracy, facilityLat, facilityLng])

  return (
    <>
      <div className="nearest-map-frame">
        <div ref={container} className="nearest-facility-map" role="application" aria-label="Map showing your location and the nearest e-waste facility" />
        {status !== "ready" && (
          <div className="nearest-map-message" role={status === "error" ? "alert" : "status"}>
            {status === "loading" && "Loading map..."}
            {status === "missing-key" && "Map is unavailable because the Google Maps API key is not configured."}
            {status === "error" && "Map could not load. Check the Google Maps API key and network connection."}
          </div>
        )}
      </div>
      {status === "ready" && (
        <div className="nearest-map-legend" aria-label="Map legend">
          {position && <span><i className="nearest-map-dot nearest-map-user" />Your location (±{Math.round(position.accuracy)} m)</span>}
          {facility && <span><i className="nearest-map-dot nearest-map-facility" />{facility.name}</span>}
        </div>
      )}
    </>
  )
}
