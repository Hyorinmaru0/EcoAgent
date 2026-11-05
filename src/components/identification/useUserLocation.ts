import { useEffect, useRef, useState } from "react"
import { readBrowserLocation } from "./browserLocation.mjs"
import type { UserLocation as BrowserUserLocation } from "./browserLocation.mjs"

export type UserLocation = BrowserUserLocation & { source?: "device" | "approximate"; municipality?: string }
export type LocationStatus = "idle" | "loading" | "ready" | "error"
export type LocationChoice = { municipality: string; latitude: number; longitude: number }

export function useUserLocation() {
  const [position, setPosition] = useState<UserLocation | null>(null)
  const [status, setStatus] = useState<LocationStatus>("idle")
  const [error, setError] = useState("")
  const requestId = useRef(0)

  useEffect(() => () => { requestId.current += 1 }, [])

  async function requestLocation() {
    const id = ++requestId.current
    setError("")
    setPosition(null)
    setStatus("loading")
    try {
      const result = await readBrowserLocation()
      if (id !== requestId.current) return
      setPosition(result)
      setStatus("ready")
    } catch (failure) {
      if (id !== requestId.current) return
      setStatus("error")
      setError(failure instanceof Error ? failure.message : "Your location could not be found. Try again.")
    }
  }

  function useApproximateLocation(choice: LocationChoice) {
    requestId.current += 1
    setPosition({ latitude: choice.latitude, longitude: choice.longitude, accuracy: 5000, source: "approximate", municipality: choice.municipality })
    setError("")
    setStatus("ready")
  }

  function clearLocation() {
    requestId.current += 1
    setPosition(null)
    setStatus("idle")
    setError("")
  }

  return { position, status, error, requestLocation, useApproximateLocation, clearLocation }
}
