import { useEffect, useRef, useState } from "react"
import "./facility-locations-map.css"

export type MappedFacility = {
  name: string
  municipality: string
  operator: string
  acceptedDevices: string
  status: string
  address?: string
  coordinates: { latitude: number; longitude: number }
}

type Props = { locations: MappedFacility[]; searchQuery: string; municipality: string; category: string }
type GoogleMapState = {
  map: google.maps.Map
  markers: Map<string, google.maps.Marker>
  infoWindow: google.maps.InfoWindow
}

let googleMapsLoad: Promise<void> | null = null

function loadGoogleMaps(apiKey: string) {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve()
  if (!googleMapsLoad) {
    googleMapsLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
      script.async = true
      script.dataset.ecocycleGoogleMaps = "true"
      script.onload = () => typeof google !== "undefined" && google.maps ? resolve() : reject(new Error("Google Maps did not load"))
      script.onerror = () => {
        googleMapsLoad = null
        reject(new Error("Google Maps could not load"))
      }
      document.head.append(script)
    })
  }
  return googleMapsLoad
}

function createPopup(facility: MappedFacility) {
  const popup = document.createElement("div")
  popup.className = "facility-map-popup"
  const name = document.createElement("strong")
  name.textContent = facility.name
  const municipality = document.createElement("p")
  municipality.textContent = facility.municipality
  const acceptance = document.createElement("p")
  acceptance.textContent = `Device acceptance: ${facility.acceptedDevices}`
  const status = document.createElement("p")
  status.textContent = facility.status
  popup.append(name, municipality, acceptance, status)
  if (facility.address) {
    const address = document.createElement("p")
    address.textContent = facility.address
    popup.append(address)
  }
  const directions = document.createElement("a")
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${facility.coordinates.latitude},${facility.coordinates.longitude}`
  directions.target = "_blank"
  directions.rel = "noreferrer"
  directions.textContent = "Directions in Google Maps"
  popup.append(directions)
  return popup
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

function matchesCategory(facility: MappedFacility, category: string) {
  if (category === "All categories") return true
  const accepted = normalize(`${facility.acceptedDevices} ${facility.status}`)
  if (category === "TVs") return accepted.includes("tv") || accepted.includes("television")
  if (category === "Laptops") return accepted.includes("laptop")
  if (category === "Mobile phones") return accepted.includes("phone")
  return true
}

function searchScore(facility: MappedFacility, query: string) {
  const name = normalize(facility.name)
  const address = normalize(facility.address || "")
  const municipality = normalize(facility.municipality)
  const other = normalize(`${facility.operator} ${facility.acceptedDevices} ${facility.status}`)
  const tokens = query.split(/\s+/).filter(Boolean)
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (tokens.every((token) => name.includes(token))) return 3
  if (tokens.every((token) => address.includes(token))) return 4
  if (tokens.every((token) => municipality.includes(token))) return 5
  if (tokens.every((token) => other.includes(token))) return 6
  const allFields = `${name} ${address} ${municipality} ${other}`
  if (tokens.every((token) => allFields.includes(token))) return 7
  return Infinity
}

function getMapTargets(locations: MappedFacility[], searchQuery: string, municipality: string, category: string) {
  const scoped = locations.filter((facility) =>
    (municipality === "All locations" || facility.municipality === municipality) && matchesCategory(facility, category),
  )
  const query = normalize(searchQuery)
  if (query.length < 2) return municipality !== "All locations" || category !== "All categories" ? scoped : []
  const exactMunicipality = scoped.filter((facility) => normalize(facility.municipality) === query)
  if (exactMunicipality.length) return exactMunicipality
  const scored = scoped.map((facility) => ({ facility, score: searchScore(facility, query) }))
    .filter((item) => Number.isFinite(item.score))
  if (!scored.length) return []
  const bestScore = Math.min(...scored.map((item) => item.score))
  return scored.filter((item) => item.score === bestScore).map((item) => item.facility)
}

function panToTargets(state: GoogleMapState, targets: MappedFacility[]) {
  if (!targets.length) return
  if (targets.length === 1) {
    const facility = targets[0]
    const key = `${facility.municipality}/${facility.name}`
    state.map.panTo({ lat: facility.coordinates.latitude, lng: facility.coordinates.longitude })
    state.map.setZoom(15)
    const marker = state.markers.get(key)
    if (marker) {
      state.infoWindow.setContent(createPopup(facility))
      state.infoWindow.open({ map: state.map, anchor: marker })
    }
    return
  }
  const bounds = new google.maps.LatLngBounds()
  targets.forEach((facility) => bounds.extend({ lat: facility.coordinates.latitude, lng: facility.coordinates.longitude }))
  state.map.fitBounds(bounds, 48)
}

export function FacilityLocationsMap({ locations, searchQuery, municipality, category }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapState = useRef<GoogleMapState | null>(null)
  const [mapStatus, setMapStatus] = useState<"missing-key" | "loading" | "ready" | "error">("loading")
  const [searchMessage, setSearchMessage] = useState("Search a facility or municipality to move the map.")

  useEffect(() => {
    if (!container.current) return
    let cancelled = false
    const googleMarkers: google.maps.Marker[] = []
    let googleInfoWindow: google.maps.InfoWindow | null = null

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
    if (!apiKey) {
      setMapStatus("missing-key")
      return () => { cancelled = true }
    }
    setMapStatus("loading")
    void loadGoogleMaps(apiKey).then(() => {
      const mapElement = container.current
      if (cancelled || !mapElement || typeof google === "undefined" || !google.maps) return
      const map = new google.maps.Map(mapElement, {
        center: { lat: 14.5995, lng: 120.9842 }, zoom: 10, mapTypeControl: false,
      })
      googleInfoWindow = new google.maps.InfoWindow()
      const markers = new Map<string, google.maps.Marker>()
      const bounds = new google.maps.LatLngBounds()
      for (const facility of locations) {
        const position = { lat: facility.coordinates.latitude, lng: facility.coordinates.longitude }
        const marker = new google.maps.Marker({ map, position, title: facility.name })
        markers.set(`${facility.municipality}/${facility.name}`, marker)
        marker.addListener("click", () => {
          googleInfoWindow?.setContent(createPopup(facility))
          googleInfoWindow?.open({ map, anchor: marker })
        })
        googleMarkers.push(marker)
        bounds.extend(position)
      }
      mapState.current = { map, markers, infoWindow: googleInfoWindow }
      if (locations.length > 1) map.fitBounds(bounds)
      else if (locations.length === 1) map.setCenter({ lat: locations[0].coordinates.latitude, lng: locations[0].coordinates.longitude })
      setMapStatus("ready")
    }).catch(() => {
      if (!cancelled) setMapStatus("error")
    })

    return () => {
      cancelled = true
      mapState.current = null
      googleMarkers.forEach((marker) => marker.setMap(null))
      googleInfoWindow?.close()
    }
  }, [locations])

  useEffect(() => {
    if (mapStatus !== "ready" || !mapState.current) return
    const timer = window.setTimeout(() => {
      const state = mapState.current
      if (!state) return
      const scopedLocations = locations.filter((facility) =>
        (municipality === "All locations" || facility.municipality === municipality) && matchesCategory(facility, category),
      )
      state.infoWindow.close()
      state.markers.forEach((marker, key) => {
        const facility = locations.find((item) => `${item.municipality}/${item.name}` === key)
        marker.setVisible(Boolean(facility && scopedLocations.includes(facility)))
      })
      const targets = getMapTargets(locations, searchQuery, municipality, category)
      if (!targets.length) {
        const noFilters = !searchQuery.trim() && municipality === "All locations" && category === "All categories"
        if (noFilters && locations.length > 1) {
          const bounds = new google.maps.LatLngBounds()
          locations.forEach((facility) => bounds.extend({ lat: facility.coordinates.latitude, lng: facility.coordinates.longitude }))
          state.map.fitBounds(bounds)
        }
        setSearchMessage(noFilters
          ? "Showing all mapped facility pins. Search a facility or municipality to move the map."
          : "No mapped facility matched these filters. Try another name or clear a filter.")
        return
      }
      panToTargets(state, targets)
      setSearchMessage(searchQuery.trim().length >= 2
        ? targets.length === 1
          ? `Map moved to ${targets[0].name}, ${targets[0].municipality}. ${scopedLocations.length} pins remain visible for the selected filters.`
          : `Map moved to show ${targets.length} matching locations. ${scopedLocations.length} pins remain visible for the selected filters.`
        : `Showing ${scopedLocations.length} pins for the selected filters.`)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [locations, mapStatus, municipality, searchQuery, category])

  return (
    <div className="facility-locations-map-frame">
      <div id="facility-locations-map" ref={container} className="facility-locations-map" role="application" aria-label={`Google Map with ${locations.length} collection facility pins`} />
      {mapStatus === "ready" && <p className="facility-map-search-status" role="status">{searchMessage}</p>}
      {mapStatus !== "ready" && <div className="facility-map-message" role={mapStatus === "error" ? "alert" : "status"}>
        {mapStatus === "loading" && "Loading Google Maps…"}
        {mapStatus === "missing-key" && <>Google Maps API key is not configured. Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to your local <code>.env</code> file, then restart the dev server.</>}
        {mapStatus === "error" && "Google Maps could not load. Check that the API key is valid and the Maps JavaScript API is enabled for it."}
      </div>}
    </div>
  )
}
