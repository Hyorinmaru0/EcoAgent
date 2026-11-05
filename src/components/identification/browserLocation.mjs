import { isValidCoordinates } from "./facilityRecommendations.mjs"

const WATCH_TIMEOUT_MS = 45000
const SETTLE_TIME_MS = 5000

function locationError(error) {
  if (error?.code === 1) {
    return new Error("Location access was denied. Allow Location in your browser's site settings, then refresh and try again.")
  }
  if (error?.code === 2) {
    return new Error("Your location could not be found. Turn on Windows Location services, connect to Wi-Fi, then try again.")
  }
  if (error?.code === 3) {
    return new Error("The location request timed out. Keep Wi-Fi on and try again; a laptop may not have GPS hardware.")
  }
  return new Error("The browser could not read this device's location. Open the app at localhost or HTTPS and try again.")
}

function getCurrentPosition(geolocation, options) {
  return new Promise((resolve, reject) => {
    try {
      geolocation.getCurrentPosition(resolve, reject, options)
    } catch (error) {
      reject(error)
    }
  })
}

function normalizePosition(position) {
  const coords = position?.coords
  if (!isValidCoordinates(coords)) {
    throw new Error("The browser returned an invalid location. Try requesting your location again.")
  }
  if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0) {
    throw new Error("The browser returned coordinates without an accuracy value, so distance cannot be calculated.")
  }
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    source: "device",
  }
}

function watchForPosition(geolocation) {
  return new Promise((resolve, reject) => {
    let watchId
    let bestPosition = null
    let lastError = null
    let settleTimer
    const stop = () => {
      clearTimeout(timeoutTimer)
      clearTimeout(settleTimer)
      if (watchId !== undefined) geolocation.clearWatch?.(watchId)
    }
    const finish = () => {
      stop()
      if (bestPosition) resolve(bestPosition)
      else reject(locationError(lastError ?? { code: 3 }))
    }
    const timeoutTimer = setTimeout(finish, WATCH_TIMEOUT_MS)

    try {
      watchId = geolocation.watchPosition((position) => {
        try {
          const candidate = normalizePosition(position)
          if (!bestPosition || candidate.accuracy < bestPosition.accuracy) {
            bestPosition = candidate
            clearTimeout(settleTimer)
            if (candidate.accuracy <= 50) finish()
            else settleTimer = setTimeout(finish, SETTLE_TIME_MS)
          }
        } catch (error) {
          lastError = error
        }
      }, (error) => {
        lastError = error
        if (error?.code === 1) {
          stop()
          reject(locationError(error))
        }
        // Position-unavailable and timeout events can be transient while the
        // browser continues looking for a Windows/Wi-Fi location fix.
      }, {
        enableHighAccuracy: true,
        timeout: WATCH_TIMEOUT_MS,
        maximumAge: 0,
      })
    } catch (error) {
      stop()
      reject(locationError(error))
    }
  })
}

async function getSinglePosition(geolocation) {
  try {
    const position = await getCurrentPosition(geolocation, {
      enableHighAccuracy: true,
      timeout: WATCH_TIMEOUT_MS,
      maximumAge: 0,
    })
    return normalizePosition(position)
  } catch (error) {
    if (error instanceof Error && !("code" in error)) throw error
    throw locationError(error)
  }
}

export async function readBrowserLocation(
  geolocation = globalThis.navigator?.geolocation,
  secureContext = globalThis.isSecureContext,
) {
  if (!secureContext) {
    throw new Error("Location only works on HTTPS or localhost. Open this app using its localhost address, not a LAN IP or file path.")
  }
  if (!geolocation?.getCurrentPosition) {
    throw new Error("This browser does not provide device location. Try the latest Chrome or Edge over HTTPS or localhost.")
  }

  // watchPosition can report a fix that arrives after an initial lookup would
  // have timed out, and can deliver improved coordinates as Windows refines it.
  if (typeof geolocation.watchPosition === "function") return watchForPosition(geolocation)
  return getSinglePosition(geolocation)
}
