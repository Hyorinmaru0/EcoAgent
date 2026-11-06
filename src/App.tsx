import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AuthPage } from "./components/auth/AuthPage"
import { FacilityLocationsMap } from "./components/facilities/FacilityLocationsMap"
import type { AccountProfile } from "./components/auth/authValidation"
import { authRequest } from "./components/auth/authApi"
import { useAccountWorkspace } from "./components/auth/useAccountWorkspace"
import { TvDetectionPanel } from "./components/identification/TvDetectionPanel"
import { CameraCapture } from "./components/identification/CameraCapture"
import { NearestFacilityPanel } from "./components/identification/NearestFacilityPanel"
import { useUserLocation, type LocationChoice } from "./components/identification/useUserLocation"
import { getDetectedCategory, useTvDetection, validateDevicePhoto, type DeviceCategory } from "./components/identification/useTvDetection"
import { assessDeviceDetections } from "./components/identification/deviceDetectionPolicy.mjs"
import { assessPhotoDamage } from "./components/identification/damageAssessment.mjs"
import { getFacilityRecommendations, type Coordinates, type FacilityRecord } from "./components/identification/facilityRecommendations.mjs"

type CollectionSchedule = { days: string; opens: string; closes: string }
type CollectionCoordinates = Coordinates & { source?: string; venueName?: string }
type CollectionLocation = {
  name: string
  operator: string
  acceptedDevices: string
  status: string
  address?: string
  operatingHours: CollectionSchedule[]
  coordinates?: CollectionCoordinates
  visitInfo?: FacilityRecord["visitInfo"]
}
type CollectionArea = { municipality: string; locations: CollectionLocation[] }
type SelectedFacility = FacilityRecord & { municipality: string }

function WorkflowSteps({ current, analyzed }: { current: number; analyzed: boolean }) {
  return <nav className="workflow-steps" aria-label="E-waste identification progress">
    {["Identify e-waste", "AI analysis", "Facility recommendation", "Facility details"].map((label, index) => (
      <span key={label} className={current === index + 1 ? "current" : analyzed && index + 1 < current ? "completed" : ""} aria-current={current === index + 1 ? "step" : undefined}>
        {index + 1} <b>{label}</b>
      </span>
    ))}
  </nav>
}

function facilityDirectionsUrl(name: string, municipality: string, address?: string, coordinates?: Coordinates) {
  const destination = coordinates
    ? `${coordinates.latitude},${coordinates.longitude}`
    : `${name}, ${municipality}${address ? `, ${address}` : ""}, Metro Manila, Philippines`
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination })}`
}

type Page = "home" | "login" | "dashboard" | "identify" | "recommendations" | "facilities" | "facility" | "learn" | "flow" | "profile" | "items"

type IconName = "recycle" | "arrow" | "leaf" | "pin" | "shield" | "robot" | "upload" | "camera" | "check" | "clock" | "search" | "grid" | "box" | "book" | "user" | "close" | "send" | "sparkles" | "phone" | "laptop" | "battery" | "tv" | "menu" | "plus" | "heart"
type ChatMessage = { role: "bot" | "user" | "error"; text: string; source?: string; question?: string }

function renderChatInline(text: string, keyPrefix: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g)

  return segments.map((segment, index) => {
    const isBold =
      (segment.startsWith("**") && segment.endsWith("**")) ||
      (segment.startsWith("__") && segment.endsWith("__"))
    const isEmphasis =
      isBold ||
      (segment.startsWith("*") && segment.endsWith("*")) ||
      (segment.startsWith("_") && segment.endsWith("_"))

    if (!isEmphasis) return segment

    const markerLength = isBold ? 2 : 1
    return (
      <strong key={`${keyPrefix}-${index}`}>
        {segment.slice(markerLength, -markerLength)}
      </strong>
    )
  })
}

function renderChatResponse(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/)
  const content: ReactNode[] = []

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/)

    if (listMatch) {
      const listItems: ReactNode[] = []
      const ordered = Boolean(listMatch[2])

      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/)
        if (!match || Boolean(match[2]) !== ordered) break
        listItems.push(
          <li key={`item-${index}`}>
            {renderChatInline(match[3], `item-${index}`)}
          </li>,
        )
        index += 1
      }

      const List = ordered ? "ol" : "ul"
      content.push(<List key={`list-${index}`}>{listItems}</List>)
      continue
    }

    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)
    content.push(
      <div className="chat-text-line" key={`line-${index}`}>
        {headingMatch ? (
          <strong>{renderChatInline(headingMatch[1], `heading-${index}`)}</strong>
        ) : (
          renderChatInline(line, `line-${index}`)
        )}
      </div>,
    )
    index += 1
  }

  return content
}

function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName
  size?: number
  className?: string
}) {
  if (name === "recycle") {
    return (
      <img
        src="/recycle-mark.png"
        width={size}
        height={size}
        className={`recycle-mark ${className}`}
        alt=""
        aria-hidden="true"
      />
    )
  }

  const paths: Record<IconName, ReactNode> = {
    recycle: (
      <>
        <path d="m8 6 3-4 4 7M10 2l-3 5M17 9l5 1-1 8h-8M22 10l-4 3M10 20l-3 3-6-6 4-7M7 23v-5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C9 2 3 6 4 13s13 9 16-10Z" />
        <path d="M3 22 15 10" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    robot: (
      <>
        <rect x="4" y="7" width="16" height="13" rx="4" />
        <path d="M12 7V3m-10 9v4m20-4v4M9 16h6" />
        <circle cx="8.5" cy="11.5" r=".7" />
        <circle cx="15.5" cy="11.5" r=".7" />
        <circle cx="12" cy="2" r="1" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5M12 12v10M7 4l10 5" />
      </>
    ),
    book: (
      <>
        <path d="M12 5c-4-3-9-2-9-2v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Zm0 0L11 13" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 5h4m-3 14h2" />
      </>
    ),
    laptop: (
      <>
        <rect x="4" y="3" width="16" height="13" rx="2" />
        <path d="m4 16-3 5h22l-3-5M10 18h4" />
      </>
    ),
    battery: (
      <>
        <rect x="3" y="6" width="17" height="12" rx="2" />
        <path d="M22 10v4m-14-2h7m-4-3v6" />
      </>
    ),
    tv: (
      <>
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="m8 22 4-4 4 4M8 2l4 3 4-3" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    plus: <path d="M12 4v16M4 12h16" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  className = "",
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "text"
  type?: "button" | "submit"
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode
  tone?: string
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

const lessons = [
  {
    title: "What Is E-Waste?",
    subtitle:
      "Understand the devices and components that become electronic waste.",
    icon: "laptop" as IconName,
    color: "green",
    text: "This EcoAgent pilot focuses on discarded TVs, mobile phones, and laptops. These devices can contain reusable materials as well as components that require careful handling. Keep them separate from ordinary household waste and consult appropriate disposal guidance.",
  },
  {
    title: "Why Proper Disposal Matters",
    subtitle: "Protect people, resources, and the environment.",
    icon: "leaf" as IconName,
    color: "green",
    text: "Responsible disposal helps keep hazardous substances out of soil and waterways while allowing useful metals, glass, and plastics to be recovered. Contact a collection facility to confirm accepted items and handling practices.",
  },
  {
    title: "How to Handle Electronic Waste",
    subtitle: "Simple precautions for safer handling.",
    icon: "shield" as IconName,
    color: "blue",
    text: "Handle TVs, mobile phones, and laptops carefully, keep them dry, and do not dismantle them. Back up and erase personal data on phones and laptops when safe. Confirm item-specific requirements with a collection facility before visiting.",
  },
  {
    title: "Reuse and Recycling",
    subtitle: "Extend product life before choosing responsible recycling.",
    icon: "recycle" as IconName,
    color: "green",
    text: "Repair, donation, and reuse can extend the useful life of working electronics. When reuse is no longer suitable, check whether a collection option accepts your item category.",
  },
  {
    title: "Hazardous Electronic Components",
    subtitle: "Learn why supported devices need careful handling.",
    icon: "battery" as IconName,
    color: "orange",
    text: "TVs, mobile phones, and laptops contain electronic components and may include batteries or screens that need careful handling. Do not crush, burn, puncture, or dismantle devices. Verify item-specific requirements with a collection facility.",
  },
]

const validPages: Page[] = [
  "home",
  "login",
  "dashboard",
  "identify",
  "recommendations",
  "facilities",
  "facility",
  "learn",
  "flow",
  "profile",
  "items",
]

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    validPages.includes(location.hash.slice(1) as Page)
      ? location.hash.slice(1) as Page
      : "home",
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const chatRequest = useRef<AbortController | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "bot",
      text: "Hi! I'm EcoAgent Ask Bot. I can help identify e-waste, explain safe handling, discuss repair and reuse, and look up the facility information available in this prototype.",
    },
  ])
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null)
  const workspace = useAccountWorkspace(accountProfile)
  const [authReturnPage, setAuthReturnPage] = useState<Page>("dashboard")
  const [profileSaving, setProfileSaving] = useState(false)
  const [savedSignature, setSavedSignature] = useState("")
  const saveKey = useRef({ signature: "", key: "" })
  const latestItemSignature = useRef("")
  const authEpoch = useRef(0)
  const [collectionLocations, setCollectionLocations] = useState<CollectionArea[]>([])
  const [facilityDataError, setFacilityDataError] = useState("")
  const [facilityRevision, setFacilityRevision] = useState(0)
  const [facilityLoading, setFacilityLoading] = useState(true)
  const [userName, setUserName] = useState("Guest")
  const [userType, setUserType] = useState("General User")
  const [category, setCategory] = useState("")
  const [categorySuggestion, setCategorySuggestion] = useState<DeviceCategory | null>(null)
  const [device, setDevice] = useState("")
  const [condition, setCondition] = useState("")
  const [quantity, setQuantity] = useState("")
  const [profileLocation, setProfileLocation] = useState("")
  const userLocation = useUserLocation()
  const [analyzed, setAnalyzed] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const tvDetection = useTvDetection(photoFile, category)
  const itemGuidanceReady = analyzed && (!photo || Boolean(tvDetection.result &&
    !tvDetection.isAnalyzing && assessDeviceDetections(tvDetection.result.detections, category).status === "accepted"))
  const [selectedFacility, setSelectedFacility] = useState<SelectedFacility | null>(null)
  const [returnPage, setReturnPage] = useState<Page>("facilities")
  const saved = workspace.savedFacilities
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All categories")
  const [locationFilter, setLocationFilter] = useState("All locations")
  const [article, setArticle] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  const upload = useRef<HTMLInputElement>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 20_000)
    setFacilityLoading(true)
    setFacilityDataError("")
    fetch("/api/facilities", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Facility data is unavailable.")
        return response.json() as Promise<{ facilities: CollectionArea[] }>
      })
      .then((data) => {
        if (!Array.isArray(data.facilities) || data.facilities.some((area) => typeof area.municipality !== "string" || !Array.isArray(area.locations) || area.locations.some((facility) =>
          !facility || [facility.name, facility.operator, facility.acceptedDevices, facility.status].some((value) => typeof value !== "string") ||
          (facility.operatingHours !== undefined && !Array.isArray(facility.operatingHours))))) throw new Error("Invalid facility records")
        if (active) setCollectionLocations(data.facilities)
      })
      .catch(() => {
        if (active) setFacilityDataError("We couldn't load the facility directory. Check your connection and try again.")
      })
      .finally(() => { window.clearTimeout(timer); if (active) setFacilityLoading(false) })
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [facilityRevision])

  useEffect(() => {
    let active = true
    let checking = false
    const refreshSession = async () => {
      if (checking || document.visibilityState === "hidden") return
      checking = true
      const epoch = authEpoch.current
      try {
        const { user } = await authRequest<{ user: AccountProfile | null }>("/api/auth/me")
        if (!active || epoch !== authEpoch.current) return
        setAccountProfile((current) => JSON.stringify(current) === JSON.stringify(user) ? current : user)
      } catch { /* Public pages remain available while the account service is offline. */ }
      finally { checking = false }
    }
    void refreshSession()
    window.addEventListener("focus", refreshSession)
    document.addEventListener("visibilitychange", refreshSession)
    return () => { active = false; window.removeEventListener("focus", refreshSession); document.removeEventListener("visibilitychange", refreshSession) }
  }, [])

  useEffect(() => {
    chatRequest.current?.abort()
    chatRequest.current = null
    setIsSending(false)
    setMessages([{ role: "bot", text: "Hi! I'm EcoAgent Ask Bot. Ask me about a TV, phone, or laptop, safe handling, or collection facilities." }])
    setChatInput("")
    return () => { chatRequest.current?.abort(); chatRequest.current = null }
  }, [accountProfile?.id])

  useEffect(() => {
    if (!tvDetection.result) { setCategorySuggestion(null); return }
    const detectedCategory = getDetectedCategory(tvDetection.result.detections)
    // Suggest the photo's strongest match instead of silently replacing a
    // category the user may have chosen deliberately.
    setCategorySuggestion(detectedCategory && detectedCategory !== category ? detectedCategory : null)
    // Compare against the category only when a new result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvDetection.result])

  useEffect(() => {
    if (!analyzed) return
    document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [analyzed])

  const applyPhoto = (file: File) => {
    const error = validateDevicePhoto(file)
    if (error) {
      setNotice(error)
      return false
    }
    // A replacement photo is a new identification attempt. The previous item's
    // category must not reject a different device before it can be identified.
    if (photoFile) {
      setCategory("")
      setCategorySuggestion(null)
      setDevice("")
      setQuantity("1")
    }
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
    setPhotoName(file.name)
    setCondition("Unknown")
    setQuantity((current) => current || "1")
    setAnalyzed(false)
    return true
  }

  const go = (next: Page) => {
    location.hash = next
    setPage(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const acceptCategorySuggestion = async () => {
    if (!categorySuggestion) return
    const next = categorySuggestion
    setCategory(next)
    setCategorySuggestion(null)
    setAnalyzed(false)
    if (!device.trim()) setDevice(`Old ${next}`)
    const signature = JSON.stringify([device.trim() ? device : `Old ${next}`, next, condition, quantity, photoName, photoFile?.lastModified])
    if (await tvDetection.analyze(next) && signature === latestItemSignature.current) setAnalyzed(true)
  }

  const openFacility = (facility: SelectedFacility) => {
    setSelectedFacility(facility)
    setReturnPage(page)
    go("facility")
  }

  useEffect(() => {
    setUserName(accountProfile?.fullName || "Guest")
    setUserType(accountProfile?.userType || "General User")
    setProfileLocation(accountProfile?.location || "")
  }, [accountProfile])

  useEffect(() => {
    setSavedSignature("")
    saveKey.current = { signature: "", key: "" }
  }, [accountProfile?.id])

  const requireAccount = () => {
    if (accountProfile) return true
    setAuthReturnPage(page)
    setNotice("Sign in to save items and facilities to your own account.")
    go("login")
    return false
  }
  const signOut = async (asGuest = false) => {
    authEpoch.current += 1
    try {
      await authRequest<{ ok: boolean }>("/api/auth/logout", {}, accountProfile?.id)
      setAccountProfile(null)
      userLocation.clearLocation()
      setPhoto(null); setPhotoFile(null); setPhotoName("")
      setDevice(""); setCategory(""); setCondition(""); setQuantity(""); setAnalyzed(false)
      setSelectedFacility(null)
      setMessages([{ role: "bot", text: "Hi! I can help with device handling and collection facilities." }])
      setNotice(asGuest ? "You are exploring EcoAgent as a guest. Sign in to save your activity." : "You have been signed out.")
      go(asGuest ? "dashboard" : "home")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to sign out. Please try again.") }
  }
  const isFacilitySaved = (facility: SelectedFacility) => saved.some((entry) => entry.name === facility.name && entry.municipality === facility.municipality)
  const itemSignature = JSON.stringify([device, category, condition, quantity, photoName, photoFile?.lastModified])
  latestItemSignature.current = itemSignature
  const saveIdentifiedItem = async () => {
    if (!requireAccount() || !itemGuidanceReady || workspace.busy) return
    if (saveKey.current.signature !== itemSignature) saveKey.current = { signature: itemSignature, key: crypto.randomUUID() }
    try {
      await workspace.update("/api/account/items", {
        clientKey: saveKey.current.key, name: device, category, condition, quantity: Number(quantity),
        analysisKind: photo ? "photo" : "manual",
        photoCondition: photo ? assessPhotoDamage(tvDetection.result, category).title : null,
      })
      setSavedSignature(itemSignature)
      setNotice("Item and analysis summary saved to your account.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save this item.") }
  }

  useEffect(() => {
    const handler = () => {
      const hash = location.hash.slice(1) as Page
      setPage(validPages.includes(hash) ? hash : "home")
    }
    window.addEventListener("hashchange", handler)
    return () => window.removeEventListener("hashchange", handler)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(""), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages])
  useEffect(() => {
    if (chatOpen) chatInputRef.current?.focus()
  }, [chatOpen])
  useEffect(() => {
    if (!chatOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [chatOpen])
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo)
    },
    [photo],
  )

  const normalizedCategory = category
  const municipalities = [...new Set(collectionLocations.map((entry) => entry.municipality))]
    .sort((a, b) => a.localeCompare(b))
  const mappedCollectionLocations = collectionLocations
  const mappedFacilityPins = useMemo(() => mappedCollectionLocations.flatMap((entry) => entry.locations.flatMap((facility) => facility.coordinates
    ? [{ ...facility, municipality: entry.municipality, coordinates: facility.coordinates }]
    : [])), [mappedCollectionLocations])
  const locationChoices: LocationChoice[] = municipalities.flatMap((municipality) => {
    const points = mappedFacilityPins.filter((facility) => facility.municipality === municipality)
    if (!points.length) return []
    return [{
      municipality,
      latitude: points.reduce((sum, point) => sum + point.coordinates.latitude, 0) / points.length,
      longitude: points.reduce((sum, point) => sum + point.coordinates.longitude, 0) / points.length,
    }]
  })
  useEffect(() => {
    if (userLocation.position || !accountProfile?.location) return
    const preferred = locationChoices.find((choice) => choice.municipality.toLowerCase() === accountProfile.location?.trim().toLowerCase())
    if (preferred) userLocation.useApproximateLocation(preferred)
    // Apply a saved city only when profile/directory data changes; never replace GPS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountProfile?.location, collectionLocations])
  const facilityRecommendations = getFacilityRecommendations(
    mappedCollectionLocations,
    category,
    userLocation.position,
  )
  const itemHazardNote =
    "Exact hazard classification depends on the device model, components, and condition; this prototype does not verify a formal classification."
  const itemHandlingGuidance =
    category === "TV"
      ? "Keep the TV intact, do not dismantle it, and protect the screen when moving it. Confirm a collection facility accepts TVs before visiting."
      : category === "Mobile Phone"
        ? "Keep the phone intact and separate from household rubbish. Back up and erase personal data when safe, and do not open or puncture the battery."
        : "Keep the laptop intact and separate from household rubbish. Back up and erase personal data when safe, and check a collection facility's requirements before visiting."
  const normalizedSearch = search
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean)
  const filteredCollectionLocations = collectionLocations.flatMap((entry) => {
    if (locationFilter !== "All locations" && entry.municipality !== locationFilter) return []
    const locations = entry.locations.filter((location) => {
      const acceptanceText = `${location.acceptedDevices} ${location.status}`
        .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      const categoryMatches = filter === "All categories" ||
        (filter === "TVs" ? acceptanceText.includes("tv") || acceptanceText.includes("television")
          : filter === "Laptops" ? acceptanceText.includes("laptop")
            : acceptanceText.includes("phone"))
      if (!categoryMatches) return false
      const searchable = `${entry.municipality} ${location.name} ${location.operator} ${location.status} ${location.acceptedDevices} ${location.address ?? ""} ${location.operatingHours?.map((schedule) => `${schedule.days} ${schedule.opens} ${schedule.closes}`).join(" ") ?? ""}`
        .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      return searchTerms.every((term) => searchable.includes(term))
    })
    return locations.length ? [{ ...entry, locations }] : []
  })
  const filteredCollectionCount = filteredCollectionLocations.reduce((count, entry) => count + entry.locations.length, 0)
  const hasDirectoryFilters = Boolean(normalizedSearch) || filter !== "All categories" || locationFilter !== "All locations"
  const clearDirectoryFilters = () => {
    setSearch("")
    setFilter("All categories")
    setLocationFilter("All locations")
  }
  const toggleSaved = async (facility: SelectedFacility) => {
    if (!requireAccount() || workspace.busy) return
    const wasSaved = isFacilitySaved(facility)
    try {
      await workspace.update("/api/account/facilities/toggle", { name: facility.name, municipality: facility.municipality, saved: !wasSaved })
      setNotice(wasSaved ? "Facility removed from your account." : "Facility saved to your account.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save this facility.") }
  }
  const sendMessage = async (text = chatInput) => {
    const question = text.trim()
    if (!question || isSending || chatRequest.current) return
    setMessages((current) => [...current, { role: "user", text: question }])
    setChatInput("")
    setIsSending(true)

    const controller = new AbortController()
    chatRequest.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 50_000)
    try {
      const history = messages
        .filter((message) => message.role !== "error")
        .slice(-8)
        .map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.text.slice(-500),
        }))
      const apiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history }),
        signal: controller.signal,
      })
      const result: { answer?: string; error?: string; topic?: string } | null =
        await apiResponse.json().catch(() => null)
      if (!apiResponse.ok) {
        throw new Error(
          result?.error ||
            `The assistant service returned an error (HTTP ${apiResponse.status}).`,
        )
      }
      const answer = result?.answer
      if (chatRequest.current !== controller) return
      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("The assistant service returned an empty or invalid answer.")
      }
      setMessages((current) => [...current, { role: "bot", text: answer, source: result?.topic === "gemini-chat" ? "Gemini" : "Local guidance" }])
    } catch (error) {
      if (chatRequest.current !== controller) return
      console.error("EcoAgent Ask Bot request failed:", error)
      const errorText =
        controller.signal.aborted
          ? "The assistant took too long to respond. Please try again."
          : error instanceof TypeError
          ? "Couldn't connect to the assistant service. Check your connection and try again."
          : error instanceof Error
            ? error.message
            : "The assistant service could not answer. Please try again."
      setMessages((current) => [
        ...current,
        {
          role: "error",
          text: errorText,
          question,
        },
      ])
    } finally {
      window.clearTimeout(timeout)
      if (chatRequest.current === controller) { chatRequest.current = null; setIsSending(false) }
    }
  }

  const title = (eyebrow: string, heading: string, subtitle: string) => (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{heading}</h1>
      <p>{subtitle}</p>
    </div>
  )
  const sidebar = ["dashboard", "recommendations", "profile", "items"].includes(
    page,
  )
  const sideLinks: { page: Page; label: string; icon: IconName }[] = [
    { page: "dashboard", label: "Dashboard", icon: "grid" },
    { page: "items", label: "Registered E-Waste", icon: "box" },
    { page: "recommendations", label: "Facility Guidance", icon: "sparkles" },
    { page: "facilities", label: "Facility Directory", icon: "pin" },
    { page: "learn", label: "Educational Resources", icon: "book" },
    { page: "profile", label: "Profile", icon: "user" },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="nav-inner">
          <button
            className="logo"
            onClick={() => go("home")}
            aria-label="EcoAgent home"
          >
            <img className="logo-mark" src="/ecoagent-logo-mark.png" alt="" />
            <img
              className="logo-wordmark"
              src="/ecoagent-logo-wordmark.png"
              alt=""
            />
          </button>
          <nav
            className={menuOpen ? "main-nav open" : "main-nav"}
            aria-label="Main navigation"
          >
            {([
              { page: "home", label: "Home" },
              { page: "identify", label: "Identify E-Waste" },
              { page: "recommendations", label: "Facility Guidance" },
              { page: "facilities", label: "Facility Directory" },
              { page: "learn", label: "Learn" },
            ] as { page: Page; label: string }[]).map((link) => (
              <button
                key={link.page}
                className={page === link.page ? "nav-link active" : "nav-link"}
                onClick={() => go(link.page)}
              >
                {link.label}
              </button>
            ))}
          </nav>
          <Button
            variant="secondary"
            className="login-button"
            onClick={() => go(accountProfile ? "profile" : "login")}
          >
            <Icon name="user" size={17} />
            {accountProfile ? "My Account" : "Login / Register"}
          </Button>
          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </header>

      {page === "home" ? (
        <main>
          <section className="hero">
            <div className="hero-inner">
              <div className="hero-copy">
                <div className="hero-pill">
                  <Icon name="leaf" size={15} />
                  <span>Smarter guidance for a greener future</span>
                </div>
                <h1>
                  Understand your e-waste.
                  <br />
                  <span>Find the right place for it.</span>
                </h1>
                <p>
                  Identify old electronics, learn how to handle them
                  responsibly, and use EcoAgent Ask Bot to explore the sample
                  facility directory.
                </p>
                <div className="hero-actions">
                  <Button onClick={() => go("identify")}>
                    Identify E-Waste
                    <Icon name="arrow" size={19} />
                  </Button>
                  <Button variant="secondary" onClick={() => go("facilities")}>
                    Browse Facilities
                  </Button>
                </div>
                <div className="hero-trust">
                  <span>
                    <Icon name="shield" size={17} />
                    Facility verification notes
                  </span>
                  <span>
                    <Icon name="sparkles" size={17} />
                    Project-based guidance
                  </span>
                  <span>
                    <Icon name="book" size={17} />
                    Accessible education
                  </span>
                </div>
              </div>
              <div className="learning-art hero-orbit">
                <Icon name="recycle" size={150} />
                <span>
                  <Icon name="phone" size={39} />
                </span>
                <span>
                  <Icon name="laptop" size={48} />
                </span>
                <span>
                  <Icon name="tv" size={38} />
                </span>
              </div>
            </div>
          </section>
          <section className="impact-strip" aria-label="Platform features">
            <div className="impact-intro">
              <span className="impact-icon">
                <Icon name="robot" size={26} />
              </span>
              <div>
                One guide.
                <br />
                <strong>Clearer choices.</strong>
              </div>
            </div>
            <div className="impact-stat">
              <strong>01</strong>
              <span>Identify your electronic item</span>
            </div>
            <div className="impact-stat">
              <strong>02</strong>
              <span>Review hazards and guidance</span>
            </div>
            <div className="impact-stat">
              <strong>03</strong>
              <span>Explore suitable facilities</span>
            </div>
          </section>
          <section className="how-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  INFORMATION THAT LEADS TO ACTION
                </span>
                <h2>A simple, transparent path.</h2>
              </div>
              <p>
                EcoAgent Ask Bot helps you understand the item first,
                <br />
                then explains suitable facility information.
              </p>
            </div>
            <div className="steps-grid">
              <button className="step-card" onClick={() => go("identify")}>
                <div className="step-top">
                  <span className="feature-icon">
                    <Icon name="search" size={25} />
                  </span>
                  <span className="step-number">01</span>
                </div>
                <h3>Identify e-waste</h3>
                <p>
                  Search for an item or enter its category, condition, and
                  quantity.
                </p>
                <span className="card-link">
                  Analyze an item
                  <Icon name="arrow" size={16} />
                </span>
              </button>
              <button
                className="step-card"
                onClick={() => go("recommendations")}
              >
                <div className="step-top">
                  <span className="feature-icon blue">
                    <Icon name="robot" size={25} />
                  </span>
                  <span className="step-number">02</span>
                </div>
                <h3>Check collection options</h3>
                <p>
                  Review project-listed locations and confirm acceptance rules
                  and schedules directly.
                </p>
                <span className="card-link">
                  View facility guidance
                  <Icon name="arrow" size={16} />
                </span>
              </button>
              <button className="step-card" onClick={() => go("facilities")}>
                <div className="step-top">
                  <span className="feature-icon orange">
                    <Icon name="pin" size={25} />
                  </span>
                  <span className="step-number">03</span>
                </div>
                <h3>Review facility details</h3>
                <p>
                  Compare accepted items, locations, operating days, and
                  published hours.
                </p>
                <span className="card-link">
                  Open directory
                  <Icon name="arrow" size={16} />
                </span>
              </button>
            </div>
          </section>
          <section className="ecobot-banner">
            <div className="bot-avatar">
              <Icon name="robot" size={43} />
              <span className="bot-online" />
            </div>
            <div className="bot-banner-copy">
              <div className="banner-title">
                <h2>Meet EcoAgent Ask Bot, your e-waste guide.</h2>
                <Badge tone="blue">E-WASTE ASSISTANT</Badge>
              </div>
              <p>
                Ask about TVs, mobile phones, laptops, handling guidance, or
                the collection-location information available here.
              </p>
            </div>
            <Button onClick={() => setChatOpen(true)}>
              Ask EcoAgent
              <Icon name="sparkles" size={17} />
            </Button>
          </section>
          <section className="home-learn">
            <div>
              <span className="eyebrow">
                A LITTLE KNOWLEDGE. A BIG DIFFERENCE.
              </span>
              <h2>Handle electronics with greater confidence.</h2>
            </div>
            <Button variant="text" onClick={() => go("learn")}>
              Explore educational resources
              <Icon name="arrow" size={18} />
            </Button>
          </section>
        </main>
      ) : (
        <div className={`workspace ${sidebar ? "with-sidebar" : ""}`}>
          {sidebar && (
            <aside className="sidebar">
              <div className="sidebar-label">YOUR ECO WORKSPACE</div>
              {sideLinks.map((link) => (
                <button
                  className={`side-link ${
                    page === link.page ? "selected" : ""
                  }`}
                  key={link.page}
                  onClick={() => go(link.page)}
                >
                  <Icon name={link.icon} />
                  {link.label}
                </button>
              ))}
              <div className="sidebar-help">
                <Icon name="robot" size={26} />
                <h4>Need guidance?</h4>
                <p>
                  EcoAgent Ask Bot can explain items, safe handling, and the facility information available here.
                </p>
                <button onClick={() => setChatOpen(true)}>
                  Ask EcoAgent
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </aside>
          )}
          <main
            className={`page-content ${page === "login" ? "auth-content" : ""}`}
          >
            {accountProfile && ["dashboard", "profile", "items", "facility", "identify"].includes(page) && <>
              {workspace.loading && <p role="status">Loading your saved account data...</p>}
              {workspace.error && <section className="panel" role="alert"><p>{workspace.error}</p><Button onClick={async () => {
                try {
                  authEpoch.current += 1
                  const { user } = await authRequest<{ user: AccountProfile | null }>("/api/auth/me")
                  setAccountProfile(user)
                  workspace.reload()
                  if (!user) { setAuthReturnPage(page); go("login") }
                } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reconnect your account.") }
              }}>Reload account data</Button></section>}
            </>}
            {page === "login" && (
              <AuthPage
                illustration={<Icon name="recycle" size={110} />}
                shield={<Icon name="shield" />}
                onLogin={async (email, password) => {
                  authEpoch.current += 1
                  const { user } = await authRequest<{ user: AccountProfile }>("/api/auth/login", { email, password })
                  setAccountProfile(user)
                  setUserName(user.fullName)
                  setUserType(user.userType)
                  go(authReturnPage)
                  setNotice(`Welcome back, ${user.fullName}!`)
                }}
                onRegister={async (profile, password) => {
                  authEpoch.current += 1
                  const { user } = await authRequest<{ user: AccountProfile }>("/api/auth/register", { ...profile, password })
                  setAccountProfile(user)
                  setUserName(user.fullName)
                  setUserType(user.userType)
                  go(authReturnPage)
                  setNotice("Account created. Welcome to your workspace!")
                }}
                onGuest={() => { void signOut(true) }}
              />
            )}

            {page === "dashboard" && (
              <>
                {title(
                  "YOUR ECO WORKSPACE",
                  `Hello, ${userName}!`,
                  "Your saved e-waste information, recommendations, facilities, and learning resources in one place.",
                )}
                <div className="dashboard-stats dashboard-four">
                  {[
                    {
                      icon: "box" as IconName,
                      value: String(workspace.items.length),
                      label: "Registered E-Waste Items",
                      sub: "Identified or saved electronics",
                      page: "items" as Page,
                    },
                    {
                      icon: "sparkles" as IconName,
                      value: String(facilityRecommendations.length),
                      label: "Matching Facilities",
                      sub: "For your current device category",
                      page: "recommendations" as Page,
                    },
                    {
                      icon: "heart" as IconName,
                      value: String(saved.length),
                      label: "Saved Facilities",
                      sub: "Bookmarked facility information",
                      page: "facilities" as Page,
                    },
                    {
                      icon: "book" as IconName,
                      value: String(lessons.length),
                      label: "Educational Resources",
                      sub: "Safe handling and disposal guides",
                      page: "learn" as Page,
                    },
                  ].map((card) => (
                    <button
                      className="stat-card stat-button"
                      key={card.label}
                      onClick={() => go(card.page)}
                    >
                      <Icon name={card.icon} size={24} />
                      <strong>{card.value}</strong>
                      <h4>{card.label}</h4>
                      <p>{card.sub}</p>
                    </button>
                  ))}
                </div>
                <section className="panel">
                  <h2>Your saved facilities</h2>
                  {!accountProfile ? <p>Sign in to keep facility bookmarks across visits.</p>
                    : saved.length === 0 ? <p>No saved facilities yet. Open a facility and select Save Facility.</p>
                    : <div className="facility-grid">{saved.map((facility) => <article className="facility-card" key={`${facility.municipality}/${facility.name}`}>
                      <h3>{facility.name}</h3><p>{facility.municipality}</p>
                      <Button onClick={() => openFacility(facility)}>View facility details</Button>
                      <Button variant="secondary" disabled={workspace.busy} onClick={() => toggleSaved(facility)}>Remove bookmark</Button>
                    </article>)}</div>}
                </section>
                <section className="panel dashboard-assistant">
                  <div className="assistant-intro">
                    <span className="bot-avatar">
                      <Icon name="robot" size={38} />
                    </span>
                    <div>
                      <Badge tone="blue">ECOAGENT ASK BOT</Badge>
                      <h2>Ask about a TV, mobile phone, or laptop.</h2>
                      <p>
                        Get clear explanations based on item categories and
                        available facility information.
                      </p>
                    </div>
                  </div>
                  <div className="assistant-conversation">
                    <div className="conversation-row user-row">
                      <strong>User</strong>
                      <p>Where can I recycle my old laptop?</p>
                    </div>
                    <div className="conversation-row bot-row">
                      <strong>EcoAgent Ask Bot</strong>
                      <p>
                        Your laptop is a supported device. What city or service
                        area should I check? The project directory does not
                        confirm which locations accept laptops or list current
                        schedules.
                      </p>
                    </div>
                  </div>
                  <div className="assistant-actions">
                    <Button onClick={() => setChatOpen(true)}>
                      Continue with EcoAgent
                      <Icon name="sparkles" size={17} />
                    </Button>
                    <Button variant="secondary" onClick={() => go("identify")}>
                      Identify E-Waste
                    </Button>
                  </div>
                </section>
                <p className="demo-note">
                  {accountProfile ? "Your items and bookmarks are saved to your account." : "You are browsing as a guest. Sign in to keep your items and bookmarks."}
                </p>
              </>
            )}

            {page === "identify" && (
              <>
                {title(
                  "A RESPONSIBLE FIRST STEP",
                  "Identify your electronic waste",
                  "Identify a TV, mobile phone, or laptop to review its general hazard note and handling guidance.",
                )}
                <WorkflowSteps current={tvDetection.isAnalyzing || analyzed ? 2 : 1} analyzed={itemGuidanceReady} />
                <div className="two-column">
                  <section className="panel">
                    <h2>Tell us about your item</h2>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const signature = itemSignature
                        setAnalyzed(false)
                        if (userLocation.status !== "loading") userLocation.requestLocation()
                        if (await tvDetection.analyze() && signature === latestItemSignature.current) setAnalyzed(true)
                      }}
                    >
                      <Field label="Search Electronic Item">
                        <div className="input-with-icon">
                          <Icon name="search" size={18} />
                          <input
                            value={device}
                            onChange={(event) => {
                              setDevice(event.target.value)
                              setAnalyzed(false)
                            }}
                            placeholder="Search for a TV, mobile phone, or laptop…"
                          />
                        </div>
                      </Field>
                      <div
                        className="upload-zone"
                        onClick={() => upload.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            upload.current?.click()
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <input
                          ref={upload}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) applyPhoto(file)
                            event.target.value = ""
                          }}
                        />
                        {photo ? (
                          <img
                            className="upload-preview"
                            src={photo}
                            alt="Uploaded electronic device"
                          />
                        ) : (
                          <span className="feature-icon">
                            <Icon name="upload" size={27} />
                          </span>
                        )}
                        <strong>{photoName || "Optional device photo"}</strong>
                        <span>
                          {photo
                            ? "Select to replace image"
                            : "JPG, PNG or WEBP · up to 25 MB · resized automatically"}
                        </span>
                      </div>
                      <div className="photo-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setCameraOpen(true)}
                        >
                          <Icon name="camera" size={17} />
                          Take a photo
                        </button>
                        <span>Use your camera, or select the photo area to choose a saved file.</span>
                      </div>
                      <Field label="Item Category">
                        <select
                          required
                          value={category}
                          onChange={(event) => {
                            const next = event.target.value
                            setCategory(next)
                            setCategorySuggestion((current) => current === next ? null : current)
                            setAnalyzed(false)
                          }}
                        >
                          <option value="" disabled>Select item category</option>
                          <option>TV</option>
                          <option>Mobile Phone</option>
                          <option>Laptop</option>
                        </select>
                      </Field>
                      {categorySuggestion && (
                        <div className="category-suggestion" role="status">
                          <div>
                            <strong>Photo suggests {categorySuggestion}</strong>
                            <p>Use this category for matching handling guidance and facility results?</p>
                          </div>
                          <div className="category-suggestion-actions">
                            <Button onClick={acceptCategorySuggestion} disabled={tvDetection.isAnalyzing}>
                              Use {categorySuggestion}
                            </Button>
                            <Button variant="secondary" onClick={() => setCategorySuggestion(null)}>Not now</Button>
                          </div>
                        </div>
                      )}
                      <Field label="Item Name">
                        <input
                          required
                          maxLength={120}
                          pattern=".*\S.*"
                          value={device}
                            onChange={(event) => { setDevice(event.target.value); setAnalyzed(false) }}
                          placeholder="e.g. Old Laptop"
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Condition (your observation)">
                          <select
                            required
                            value={condition}
                            onChange={(event) => { setCondition(event.target.value); setAnalyzed(false) }}
                          >
                            <option value="" disabled>Select condition</option>
                            <option>Working</option>
                            <option>Damaged</option>
                            <option>Broken</option>
                            <option>Unknown</option>
                          </select>
                        </Field>
                        <Field label="Quantity">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            required
                            placeholder="e.g. 1"
                            value={quantity}
                            onChange={(event) => { setQuantity(event.target.value); setAnalyzed(false) }}
                          />
                        </Field>
                      </div>
                      <Button type="submit" className="full-width" disabled={tvDetection.isAnalyzing}>
                        <Icon name="sparkles" size={18} />
                        {tvDetection.isAnalyzing ? "Analyzing Photo…" : "Analyze E-Waste"}
                      </Button>
                    </form>
                  </section>
                  <div>
                    <section id="analysis-result" className="panel analysis-panel">
                      <div className="panel-heading">
                        <div className="heading-with-icon">
                          <span className="feature-icon blue">
                            <Icon name="robot" size={27} />
                          </span>
                          <h2>EcoAgent Item Guidance</h2>
                        </div>
                        <Badge tone="blue">PROJECT GUIDE</Badge>
                      </div>
                      {photo && <TvDetectionPanel
                        photo={photo} category={category} result={tvDetection.result}
                        error={tvDetection.error} isAnalyzing={tvDetection.isAnalyzing}
                      />}
                      {itemGuidanceReady ? (
                        <>
                          <div className="analysis-ready">
                            <Icon name="check" size={18} />
                            {photo ? "Photo accepted — item guidance ready" : "Manual item guidance — no photo verification"}
                          </div>
                          <dl className="analysis-list">
                            {photo && <div><dt>Photo Condition</dt><dd>{assessPhotoDamage(tvDetection.result, category).title}</dd></div>}
                            <div>
                              <dt>Item</dt>
                              <dd>{device}</dd>
                            </div>
                            <div>
                              <dt>Category</dt>
                              <dd>{normalizedCategory}</dd>
                            </div>
                            <div>
                              <dt>Hazard Classification</dt>
                              <dd>
                                {itemHazardNote}
                              </dd>
                            </div>
                            <div>
                              <dt>Handling Guidance</dt>
                              <dd>
                                {itemHandlingGuidance}
                              </dd>
                            </div>
                            <div>
                              <dt>Item Details</dt>
                              <dd>
                                {condition} · {quantity} item(s)
                              </dd>
                            </div>
                          </dl>
                          <Button className="full-width" variant="secondary" disabled={workspace.busy || (Boolean(accountProfile) && savedSignature === itemSignature)} onClick={saveIdentifiedItem}>
                            {accountProfile && savedSignature === itemSignature ? "Saved to My Items" : workspace.busy ? "Saving..." : accountProfile ? "Save to My Items" : "Sign in to save this item"}
                          </Button>
                          <Button
                            className="full-width"
                            onClick={() => go("recommendations")}
                          >
                            View Nearest Facilities
                            <Icon name="arrow" size={17} />
                          </Button>
                        </>
                      ) : (
                        <div className="analysis-empty">
                          <Icon name="sparkles" size={44} />
                          <h3>Your analysis will appear here.</h3>
                          <p>
                            Enter the item category, name, condition, and
                            quantity, then select Analyze E-Waste.
                          </p>
                        </div>
                      )}
                      <p className="demo-note">
                        {category === "TV"
                          ? "Upload a device photo to try the local three-class detector and TV-specific practice model. A photo cannot establish electrical safety or damage."
                          : "Upload a device photo to try the local detector for TVs, phones, and laptops. Photo results are practice-model candidates, not verified item or condition assessments."}
                      </p>
                    </section>
                    {itemGuidanceReady && <NearestFacilityPanel
                      category={category} recommendations={facilityRecommendations}
                      position={userLocation.position} status={userLocation.status}
                      error={userLocation.error} onLocate={userLocation.requestLocation}
                      locationChoices={locationChoices} onApproximateLocation={userLocation.useApproximateLocation}
                      onDirectory={() => go("facilities")} onDetails={openFacility}
                    />}
                    <div className="safety-note">
                      <Icon name="robot" size={23} />
                      <div>
                        <strong>EcoAgent Ask Bot is available here.</strong>
                        <p>
                          Ask about TVs, mobile phones, laptops, handling, or
                          collection-location information.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setChatOpen(true)}
                      >
                        Ask EcoAgent
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {page === "recommendations" && (
              <>
                <WorkflowSteps current={3} analyzed={itemGuidanceReady} />
                {title(
                  "FACILITY GUIDANCE",
                  "Find your nearest collection option",
                  "Use your current location to find nearby e-waste facilities that list or may accept your device.",
                )}
                <div className="explanation-card">
                  <span className="feature-icon blue">
                    <Icon name="pin" size={30} />
                  </span>
                  <div>
                    <h3>{category ? `Collection options for ${category}` : "Choose your device first"}</h3>
                    <p>Allow location access to sort matching facilities by distance and see the nearest mapped venue pinned on the map.</p>
                    {device && <div className="tags"><span>{device}</span><span>{normalizedCategory}</span><span>{condition || "Condition not selected"}</span></div>}
                  </div>
                  <Button variant="secondary" onClick={() => go("identify")}>Edit item details</Button>
                </div>
                <NearestFacilityPanel
                  category={category} recommendations={facilityRecommendations}
                  position={userLocation.position} status={userLocation.status}
                  error={userLocation.error} onLocate={userLocation.requestLocation}
                  locationChoices={locationChoices} onApproximateLocation={userLocation.useApproximateLocation}
                  onDirectory={() => go("facilities")} onDetails={openFacility}
                />
              </>
            )}

            {page === "facilities" && (
              <>
                {title(
                  "COLLECTION OPTIONS IN ONE PLACE",
                  "Facility directory",
                  "Find collection options by city or municipality. Check each listing's status before you travel.",
                )}
                <div className="directory-filters">
                  <label className="search-box">
                    <Icon name="search" />
                    <input
                      aria-label="Search facilities"
                      placeholder="Try SM North EDSA or Quezon City"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") document.getElementById("facility-locations-map")?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }}
                    />
                  </label>
                  <Button variant="secondary" onClick={() => document.getElementById("facility-locations-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Find on map</Button>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                  >
                    <option>All locations</option>
                    {municipalities.map((municipality) => (
                      <option key={municipality}>{municipality}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter collection locations by accepted device"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option>All categories</option>
                    <option>TVs</option>
                    <option>Laptops</option>
                    <option>Mobile phones</option>
                  </select>
                  {hasDirectoryFilters && <Button variant="text" onClick={clearDirectoryFilters}>Clear filters</Button>}
                </div>
                {facilityDataError && <div role="alert" className="demo-note"><p>{facilityDataError}</p><Button variant="secondary" onClick={() => setFacilityRevision((value) => value + 1)}>Try loading again</Button></div>}
                {facilityLoading && <p role="status" className="demo-note">Loading facility data…</p>}
                <section className="facility-map-section" aria-labelledby="all-facilities-map-title">
                  <div className="section-heading">
                    <h2 id="all-facilities-map-title">All mapped collection locations</h2>
                    <span className="muted">{mappedFacilityPins.length} mapped pins total</span>
                  </div>
                  <p className="demo-note">Search to move the map; location and device filters also show only matching pins. Select a pin for details and directions. Five directory locations have no confirmed coordinates and are not shown.</p>
                  <FacilityLocationsMap locations={mappedFacilityPins} searchQuery={search} municipality={locationFilter} category={filter} />
                </section>
                <section className="collection-options" aria-labelledby="collection-options-title">
                  <div className="section-heading">
                    <h2 id="collection-options-title">Collection locations</h2>
                    <span className="muted">{filteredCollectionCount} matching {filteredCollectionCount === 1 ? "location" : "locations"}</span>
                  </div>
                  <p className="demo-note">
                    Listings and status notes are based on information provided
                    for this project and have not been independently verified.
                    Confirm current operation, schedules, public access, and
                    item acceptance before visiting.
                  </p>
                  <div className="collection-location-grid">
                    {filteredCollectionLocations.length === 0 ? (
                      <div className="empty-state collection-empty-state">
                        <h3>No collection locations match</h3>
                        <p>Try another facility name, address, municipality, or category.</p>
                        <Button variant="secondary" onClick={clearDirectoryFilters}>Clear filters</Button>
                      </div>
                    ) : filteredCollectionLocations.map((entry) => (
                        <article
                          className="collection-location-card"
                          key={entry.municipality}
                        >
                          <details className="collection-area-details">
                            <summary className="collection-location-heading">
                              <span className="collection-location-pin">
                                <Icon name="pin" size={17} />
                              </span>
                              <span className="collection-area-title">
                                <strong>{entry.municipality}</strong>
                                <small>{entry.locations.length} collection {entry.locations.length === 1 ? "point" : "points"}</small>
                              </span>
                            </summary>
                            <ul>
                            {entry.locations.map((location) => (
                              <li className="collection-location-item" key={`${location.operator}-${location.name}`}>
                                <strong>{location.name}</strong>
                                <button type="button" className="btn btn-secondary" onClick={() => openFacility({ ...location, municipality: entry.municipality })}>View facility details</button>
                                <span>{location.operator}</span>
                                <small>Device acceptance: {location.acceptedDevices}</small>
                                <small>{location.status}</small>
                                {location.address && <small>Address: {location.address}</small>}
                                  {!location.coordinates && <small>No confirmed map pin for this location</small>}
                                {location.operatingHours?.map((schedule) => (
                                  <small key={`${schedule.days}-${schedule.opens}-${schedule.closes}`}>
                                    {location.visitInfo?.hoursKind || "Hours"}: {schedule.days}, {schedule.opens}–{schedule.closes}
                                  </small>
                                ))}
                                {location.visitInfo && <small>{location.visitInfo.note}</small>}
                                <a
                                  className="collection-directions-link"
                                  href={facilityDirectionsUrl(location.name, entry.municipality, location.address, location.coordinates)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Get directions to ${location.name}, ${entry.municipality} (opens in a new tab)`}
                                >
                                  <Icon name="pin" size={15} />
                                  Get directions
                                  <Icon name="arrow" size={14} />
                                </a>
                              </li>
                            ))}
                            </ul>
                          </details>
                        </article>
                      ))}
                  </div>
                </section>
                <div className="safety-note">
                  <Icon name="robot" size={25} />
                  <div>
                    <strong>
                      Not sure which facility information to review?
                    </strong>
                    <p>
                      EcoAgent Ask Bot can show project-listed collection
                      locations, but accepted-item details need confirmation.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setChatOpen(true)}>
                    Ask EcoAgent
                  </Button>
                </div>
                <p className="demo-note">
                  Review each facility's source links and schedule notes. Confirm
                  collection access and device acceptance with the operator before visiting.
                </p>
              </>
            )}

            {page === "facility" && (
              <>
                <WorkflowSteps current={4} analyzed={itemGuidanceReady} />
                {selectedFacility ? <>
                  {title("FACILITY INFORMATION", selectedFacility.name, "Review this collection location before visiting.")}
                  <section className="panel facility-detail-main">
                    <h2>{selectedFacility.name}</h2>
                    <dl className="analysis-list">
                      <div><dt>Operator</dt><dd>{selectedFacility.operator}</dd></div>
                      <div><dt>City / Municipality</dt><dd>{selectedFacility.municipality}</dd></div>
                      <div><dt>Address</dt><dd>{selectedFacility.address || "Address not provided"}</dd></div>
                      <div><dt>Accepted devices</dt><dd>{selectedFacility.acceptedDevices}</dd></div>
                      <div><dt>Collection status</dt><dd>{selectedFacility.status}</dd></div>
                      <div><dt>{selectedFacility.visitInfo?.hoursKind || "Operating hours"}</dt><dd>{selectedFacility.operatingHours?.length
                        ? selectedFacility.operatingHours.map((schedule) => <p key={`${schedule.days}-${schedule.opens}-${schedule.closes}`}>{schedule.days}, {schedule.opens} - {schedule.closes}</p>)
                        : "Schedule not provided. Confirm with the facility before visiting."}</dd></div>
                    </dl>
                    {selectedFacility.visitInfo && <div className="facility-visit-note">
                      <p>{selectedFacility.visitInfo.note}</p>
                      <small>Sources reviewed: {selectedFacility.visitInfo.checkedOn}. Times are in Philippine time.</small>
                      <ul>{selectedFacility.visitInfo.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label} <Icon name="arrow" size={13} /></a></li>)}</ul>
                    </div>}
                    <div className="assistant-actions">
                      <a className="btn btn-primary" href={facilityDirectionsUrl(selectedFacility.name, selectedFacility.municipality, selectedFacility.address, selectedFacility.coordinates)} target="_blank" rel="noreferrer">Get directions <Icon name="arrow" size={16} /></a>
                      <Button variant="secondary" disabled={workspace.busy || workspace.loading} onClick={() => toggleSaved(selectedFacility)}>{isFacilitySaved(selectedFacility) ? "Remove Saved Facility" : accountProfile ? "Save Facility" : "Sign in to save facility"}</Button>
                      <Button variant="secondary" onClick={() => go(returnPage)}>{returnPage === "facilities" ? "Back to Directory" : returnPage === "identify" ? "Back to Analysis" : returnPage === "dashboard" ? "Back to Dashboard" : "Back to Recommendations"}</Button>
                    </div>
                  </section>
                </> : <section className="panel">
                  <h2>Select a facility first</h2>
                  <p>Open a recommended facility or choose a collection location from the directory to see its details.</p>
                  <Button onClick={() => go("facilities")}>Browse facility directory</Button>
                </section>}
              </>
            )}

            {page === "learn" && (
              <>
                {title(
                  "KNOW MORE. HANDLE RESPONSIBLY.",
                  "Educational resources",
                  "Accessible guidance for understanding, handling, reusing, and responsibly disposing of electronic waste.",
                )}
                <section className="learning-hero">
                  <div>
                    <Badge>THE BASICS</Badge>
                    <h2>
                      Old electronics.
                      <br />
                      Better-informed choices.
                    </h2>
                    <p>
                      EcoAgent provides information and guidance. It does not
                      physically collect, transport, or recycle electronic
                      waste.
                    </p>
                    <Button onClick={() => go("identify")}>
                      Identify an Item
                      <Icon name="arrow" size={18} />
                    </Button>
                  </div>
                  <div className="learning-art">
                    <Icon name="book" size={125} />
                    <span>
                      <Icon name="phone" size={35} />
                    </span>
                    <span>
                      <Icon name="laptop" size={43} />
                    </span>
                    <span>
                      <Icon name="battery" size={35} />
                    </span>
                  </div>
                </section>
                <div className="section-heading">
                  <h2>Explore a topic</h2>
                  <span className="muted">Five practical guides</span>
                </div>
                <div className="education-grid">
                  {lessons.map((lesson, index) => (
                    <button
                      className="step-card lesson-card"
                      key={lesson.title}
                      onClick={() =>
                        setArticle(article === index ? null : index)
                      }
                    >
                      <div className={`lesson-visual ${lesson.color}`}>
                        <Icon name={lesson.icon} size={54} />
                        <span className="lesson-read">GUIDE</span>
                      </div>
                      <h3>{lesson.title}</h3>
                      <p>{lesson.subtitle}</p>
                      <span className="card-link">
                        {article === index
                          ? "Hide information"
                          : "View information"}
                        <Icon name="arrow" size={17} />
                      </span>
                      {article === index && (
                        <div className="article-inline">
                          <p>{lesson.text}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="safety-note">
                  <Icon name="robot" size={25} />
                  <div>
                    <strong>Need a simpler explanation?</strong>
                    <p>
                      EcoAgent Ask Bot can explain e-waste terms and responsible handling
                      guidance.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setChatOpen(true)}>
                    Ask EcoAgent
                  </Button>
                </div>
              </>
            )}

            {page === "flow" && (
              <>
                {title(
                  "INTELLIGENCE WITH PURPOSE",
                  "How EcoAgent works",
                  "A transparent view of the guidance available in this prototype and the limits of its facility data.",
                )}
                <div className="agent-flow">
                  {[
                    [
                      "01 · INPUT",
                      "User identifies e-waste",
                      "Item name, category, condition, quantity, and location",
                      "user" as IconName,
                    ],
                    [
                      "02 · ANALYSIS",
                      "EcoAgent Ask Bot explains the item",
                      "Category, hazard classification, and safe handling guidance",
                      "robot" as IconName,
                    ],
                    [
                      "03 · FACILITY REVIEW",
                      "Project-listed locations are reviewed",
                      "Location names and status notes; acceptance and schedules may be unavailable",
                      "search" as IconName,
                    ],
                    [
                      "04 · LIMITATIONS",
                      "Missing information is made clear",
                      "No facility is presented as a verified match without acceptance data",
                      "sparkles" as IconName,
                    ],
                    [
                      "05 · DETAILS",
                      "User verifies current details",
                      "Acceptance, public access, address, and schedule with the operator",
                      "pin" as IconName,
                    ],
                  ].map(([step, heading, copy, icon], index) => (
                    <div key={step as string}>
                      {index > 0 && <div className="flow-arrow">↓</div>}
                      <div
                        className={`flow-node ${
                          index === 1
                            ? "ai-node"
                            : index === 4
                              ? "final-node"
                              : ""
                        }`}
                      >
                        <span className="feature-icon">
                          <Icon name={icon as IconName} size={28} />
                        </span>
                        <div>
                          <small>{step}</small>
                          <h3>{heading}</h3>
                          <p>{copy}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="centered-action">
                  <Button onClick={() => go("identify")}>
                    Try EcoAgent Item Guidance
                    <Icon name="arrow" size={17} />
                  </Button>
                </div>
              </>
            )}

            {page === "items" && (
              <>
                {title("YOUR IDENTIFIED ELECTRONICS", "Registered e-waste items", "Your saved items and analysis summaries. Condition is your observation; photos cannot confirm electrical function.")}
                <div className="toolbar">
                  <Badge>{workspace.items.length} saved items</Badge>
                  <Button onClick={() => go("identify")}>Identify an Item</Button>
                </div>
                {!accountProfile ? <section className="panel"><h2>Keep your own e-waste history</h2><p>Sign in to save items and return to them later.</p><Button onClick={requireAccount}>Sign in</Button></section>
                  : !workspace.loading && workspace.items.length === 0 ? <section className="panel"><h2>No saved items yet</h2><p>Analyze a device, then select Save to My Items.</p></section> : null}
                <div className="facility-grid">
                  {workspace.items.map((item) => <article className="facility-card" key={item.id}>
                    <Badge tone="gray">{item.analysisKind === "photo" ? "Photo analysis summary" : "Manual item entry"}</Badge>
                    <h3>{item.name}</h3><p>{item.category} - {item.condition} - {item.quantity} item(s)</p>
                    {item.photoCondition && <p>Photo assessment: {item.photoCondition}</p>}
                    <p>Saved {new Date(item.createdAt.replace(" ", "T") + "Z").toLocaleDateString()}</p>
                    <Button onClick={() => {
                      setPhoto(null); setPhotoFile(null); setPhotoName(""); setDevice(item.name); setCategory(item.category);
                      setCondition(item.condition); setQuantity(String(item.quantity)); setAnalyzed(false); go("recommendations")
                    }}>Find facilities</Button>
                    <Button variant="secondary" disabled={workspace.busy} onClick={async () => {
                      try { await workspace.update("/api/account/items/remove", { id: item.id }); setSavedSignature(""); setNotice("Item removed from your account.") }
                      catch (error) { setNotice(error instanceof Error ? error.message : "Unable to remove item.") }
                    }}>Remove saved item</Button>
                  </article>)}
                </div>
              </>
            )}

            {page === "profile" && (
              <>
                {title(
                  "YOUR ECOAGENT ACCOUNT",
                  "Your profile",
                  "Review your account profile and local preferences.",
                )}
                <section className="profile-overview">
                  <div className="profile-avatar" aria-hidden="true">{(accountProfile?.fullName || userName).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
                  <div><span className="eyebrow">YOUR PERSONAL SPACE</span><h2>{accountProfile?.fullName || "Welcome, guest"}</h2><p>{accountProfile?.email || "Sign in to keep your e-waste journey in one place."}</p><span className="badge">{accountProfile?.userType || "Guest"}</span></div>
                  <div className="profile-summary"><button onClick={() => go("items")}><strong>{workspace.loading ? "?" : workspace.items.length}</strong><span>Saved items</span></button><button onClick={() => go("recommendations")}><strong>{workspace.loading ? "?" : workspace.savedFacilities.length}</strong><span>Saved facilities</span></button></div>
                </section>
                <section className="panel profile-panel">
                  <div className="profile-section-intro"><h2>Personal information</h2><p>Keep your details up to date. Your location helps personalize facility suggestions.</p></div>
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault()
                      if (!requireAccount()) return
                      setProfileSaving(true)
                      try {
                        const { user } = await authRequest<{ user: AccountProfile }>("/api/account/profile", { fullName: userName, userType, location: profileLocation }, accountProfile?.id)
                        setAccountProfile((current) => current?.id === user.id ? user : current)
                        setNotice("Your profile has been saved to your account.")
                      } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save your profile.") }
                      finally { setProfileSaving(false) }
                    }}
                  >
                    {accountProfile && <Field label="Email address"><input type="email" value={accountProfile.email} readOnly autoComplete="email" /><small className="profile-help">This email is linked to your sign-in account.</small></Field>}
                    <Field label="Full Name">
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        disabled={profileSaving}
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                      />
                    </Field>
                    <Field label="User Type">
                      <select
                        value={userType}
                        onChange={(event) => setUserType(event.target.value)}
                      >
                        <option>Student</option>
                        <option>Household</option>
                        <option>General User</option>
                      </select>
                    </Field>
                    <Field label="Location (optional)">
                      <input
                        maxLength={200}
                        autoComplete="address-level2"
                        placeholder="e.g. Quezon City"
                        disabled={profileSaving}
                        value={profileLocation}
                        onChange={(event) =>
                          setProfileLocation(event.target.value)
                        }
                      />
                    </Field>
                    <div className="profile-actions">
                    {accountProfile && <Button variant="secondary" type="button" disabled={profileSaving} onClick={() => { setUserName(accountProfile.fullName); setUserType(accountProfile.userType); setProfileLocation(accountProfile.location || "") }}>Cancel changes</Button>}
                    <Button type={accountProfile ? "submit" : "button"} disabled={profileSaving || Boolean(accountProfile && userName === accountProfile.fullName && userType === accountProfile.userType && profileLocation === (accountProfile.location || ""))} onClick={() => { if (!accountProfile) requireAccount() }}>
                      {profileSaving ? "Saving..." : accountProfile ? "Save Changes" : "Sign in to save changes"}
                      <Icon name="check" size={17} />
                    </Button>
                    </div>
                  </form>
                  {accountProfile && <Button variant="secondary" onClick={() => { void signOut() }}>Sign out</Button>}
                </section>
              </>
            )}
          </main>
        </div>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <button className="footer-brand" onClick={() => go("home")}>
            <img
              className="footer-logo-mark"
              src="/ecoagent-logo-mark.png"
              alt=""
            />
            <img
              className="footer-logo-wordmark"
              src="/ecoagent-logo-wordmark.png"
              alt=""
            />
            <span>Understand more. Dispose responsibly.</span>
          </button>
          <div>
            <button onClick={() => go("flow")}>How EcoAgent Works</button>
            <button onClick={() => go("dashboard")}>My Dashboard</button>
            <button onClick={() => go("facilities")}>Facility Directory</button>
            <span>© {new Date().getFullYear()} EcoAgent</span>
          </div>
        </div>
      </footer>

      <button
        className={`chat-launcher ${chatOpen ? "is-open" : ""}`}
        onClick={() => setChatOpen(!chatOpen)}
        aria-label={chatOpen ? "Close EcoAgent Ask Bot" : "Ask EcoAgent"}
      >
        <Icon name={chatOpen ? "close" : "robot"} size={23} />
        {!chatOpen && <span>Ask EcoAgent</span>}
        {!chatOpen && <span className="chat-live" />}
      </button>
      {chatOpen && (
        <section
          className="chat-panel"
          aria-label="EcoAgent Ask Bot"
          aria-labelledby="chat-title"
        >
          <div className="chat-header">
            <span className="chat-bot-icon">
              <Icon name="robot" size={25} />
            </span>
            <div>
              <strong id="chat-title">EcoAgent Ask Bot</strong>
              <small>
                <span className="live-dot" aria-hidden="true" />
                Project e-waste guidance
              </small>
            </div>
            <button onClick={() => setChatOpen(false)} aria-label="Close EcoAgent Ask Bot">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="EcoAgent Ask Bot conversation"
          >
            {messages.map((message, index) => (
              <div
                className={`chat-message ${message.role}`}
                key={index}
                role={message.role === "error" ? "alert" : undefined}
              >
                {message.role === "bot" && <Icon name="robot" size={19} />}
                {message.role === "bot" ? (
                  <div className="chat-response">
                    <span className="chat-response-label">{message.source || "EcoAgent guidance"}</span>
                    <div className="chat-response-text">
                      {renderChatResponse(message.text)}
                    </div>
                  </div>
                ) : (
                  <div><p>{message.text}</p>{message.role === "error" && message.question && <button className="chat-retry" disabled={isSending} onClick={() => sendMessage(message.question)}>Try again</button>}</div>
                )}
              </div>
            ))}
            {isSending && (
              <p className="chat-status" role="status" aria-live="polite">
                EcoAgent Ask Bot is preparing an answer…
              </p>
            )}
            <div ref={chatEnd} />
          </div>
          <div
            className="chat-shortcuts"
            role="group"
            aria-label="Starter questions"
          >
            <button
              disabled={isSending}
              onClick={() => sendMessage("Is this TV e-waste?")}
            >
              Is this TV e-waste?
            </button>
            <button
              disabled={isSending}
              onClick={() => sendMessage("Where can I recycle my laptop?")}
            >
              Where can I recycle my laptop?
            </button>
            <button
              disabled={isSending}
              onClick={() => sendMessage("How do I use EcoAgent?")}
            >
              How do I use EcoAgent?
            </button>
            <button
              disabled={isSending}
              onClick={() => {
                go("facilities")
                setChatOpen(false)
              }}
            >
              Open directory
            </button>
          </div>
          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage()
            }}
          >
            <input
              ref={chatInputRef}
              maxLength={500}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about a TV, phone, or laptop…"
              aria-label="Message EcoAgent Ask Bot"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSending}
              aria-label="Send message"
            >
              <Icon name="send" size={19} />
            </button>
          </form>
          <div className="chat-disclaimer">
            Project guidance only · Confirm facility details before visiting
          </div>
        </section>
      )}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={applyPhoto}
      />
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={20} />
          {notice}
        </div>
      )}
    </div>
  )
}
