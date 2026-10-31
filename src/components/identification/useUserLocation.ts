import { useEffect, useRef, useState } from "react"
import { readBrowserLocation } from "./browserLocation.mjs"
import type { UserLocation } from "./browserLocation.mjs"

export type { UserLocation } from "./browserLocation.mjs"
export type LocationStatus = "idle" | "loading" | "ready" | "error"

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

  return { position, status, error, requestLocation }
}
