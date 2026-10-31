import { isValidCoordinates } from "./facilityRecommendations.mjs"

export function readBrowserLocation(geolocation = globalThis.navigator?.geolocation, secureContext = globalThis.isSecureContext) {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error("Location is unavailable in this browser. You can still browse the facility directory."))
      return
    }
    if (!secureContext) {
      reject(new Error("Open EcoAgent over HTTPS or localhost to use your current location."))
      return
    }
    geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isValidCoordinates(coords)) {
          reject(new Error("Your browser returned an invalid location. Try locating again."))
          return
        }
        resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy })
      },
      (failure) => reject(new Error(failure.code === 1
        ? "Location access was denied. Allow location in your browser's site settings, then try again."
        : failure.code === 3
          ? "Finding your location timed out. Try again, or browse the facility directory."
          : "Your location could not be found. Check your device's location settings and try again.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}
