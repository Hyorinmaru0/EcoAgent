let loading: Promise<void> | null = null

// Both map views share one request, including during React StrictMode remounts.
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof google !== "undefined" && google.maps?.Map) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    const timer = window.setTimeout(() => fail(), 20_000)
    function fail() {
      window.clearTimeout(timer)
      script.remove()
      reject(new Error("Google Maps could not load."))
    }
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.dataset.ecocycleGoogleMaps = "true"
    script.onload = () => {
      if (typeof google === "undefined" || !google.maps?.Map) { fail(); return }
      window.clearTimeout(timer)
      resolve()
    }
    script.onerror = fail
    document.head.append(script)
  }).catch((error) => { loading = null; throw error })
  return loading
}
