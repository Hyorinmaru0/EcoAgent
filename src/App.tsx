import { useEffect, useRef, useState, type ReactNode } from "react"
import { AuthPage } from "./components/auth/AuthPage"
import type { DemoProfile } from "./components/auth/authValidation"
import collectionLocations from "../data/collection-locations.json"

type Page = "home" | "login" | "dashboard" | "identify" | "recommendations" | "facilities" | "facility" | "learn" | "flow" | "profile" | "items"

type IconName = "recycle" | "arrow" | "leaf" | "pin" | "shield" | "robot" | "upload" | "check" | "clock" | "search" | "grid" | "box" | "book" | "user" | "close" | "send" | "sparkles" | "phone" | "laptop" | "battery" | "menu" | "plus" | "heart"

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

type Facility = {
  name: string
  location: string
  items: string[]
  days: string
  hours: string
  description: string
  info: string
  icon: IconName
}

const facilities: Facility[] = [
  {
    name: "GreenTech Recycling Center",
    location: "Sample facility address, Quezon City",
    items: ["Laptops", "Desktop computers", "Mobile phones", "Chargers"],
    days: "Monday–Friday",
    hours: "9:00 AM–5:00 PM",
    description:
      "An illustrative accredited electronics facility serving common computer and mobile device categories.",
    info: "Please review the facility's accepted-item requirements and operating hours before visiting. Contact the facility directly to verify any information that may have changed.",
    icon: "leaf",
  },
  {
    name: "Eco Recovery Hub",
    location: "Sample facility address, Marikina City",
    items: ["Mobile phones", "Batteries", "Chargers", "Small electronics"],
    days: "Monday–Saturday",
    hours: "9:00 AM–6:00 PM",
    description:
      "A sample facility focused on small electronics and components that require careful handling.",
    info: "Ask the facility about damaged or swollen batteries before visiting and follow its published handling requirements.",
    icon: "recycle",
  },
  {
    name: "Circular Electronics Center",
    location: "Sample facility address, Pasig City",
    items: ["Laptops", "Desktop computers", "Computer parts", "Mobile phones"],
    days: "Tuesday–Saturday",
    hours: "8:30 AM–4:30 PM",
    description:
      "An illustrative electronics resource center accepting a broad range of computer equipment.",
    info: "Erase personal information from devices where possible and verify current acceptance requirements directly with the facility.",
    icon: "box",
  },
]

const lessons = [
  {
    title: "What Is E-Waste?",
    subtitle:
      "Understand the devices and components that become electronic waste.",
    icon: "laptop" as IconName,
    color: "green",
    text: "E-waste includes discarded phones, computers, chargers, batteries, appliances, and other electronic equipment. These products can contain reusable materials as well as components that require careful handling. Keep electronics separate from ordinary household waste and consult appropriate disposal guidance.",
  },
  {
    title: "Why Proper Disposal Matters",
    subtitle: "Protect people, resources, and the environment.",
    icon: "leaf" as IconName,
    color: "green",
    text: "Responsible disposal helps keep hazardous substances out of soil and waterways while allowing useful metals, glass, and plastics to be recovered. Accredited facilities can explain their accepted-item requirements and handling practices.",
  },
  {
    title: "How to Handle Electronic Waste",
    subtitle: "Simple precautions for safer handling.",
    icon: "shield" as IconName,
    color: "blue",
    text: "Handle devices carefully, keep them dry, and avoid opening damaged batteries or electronic components. Back up and erase personal data when it is safe to do so. Consult an accredited facility for item-specific requirements.",
  },
  {
    title: "Reuse and Recycling",
    subtitle: "Extend product life before choosing responsible recycling.",
    icon: "recycle" as IconName,
    color: "green",
    text: "Repair, donation, and reuse can extend the useful life of working electronics. When reuse is no longer suitable, review accredited facilities that publish acceptance information for your item category.",
  },
  {
    title: "Hazardous Electronic Components",
    subtitle: "Recognize batteries and parts needing extra care.",
    icon: "battery" as IconName,
    color: "orange",
    text: "Some batteries, screens, circuit boards, and damaged components may contain hazardous substances. Do not crush, burn, puncture, or dismantle them. Seek appropriate safety guidance and verify requirements with an accredited facility.",
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
  const [messages, setMessages] = useState<{ role: "bot" | "user"; text: string }[]>([
    {
      role: "bot",
      text: "Hi! I'm EcoBot. I can help identify e-waste, explain safe handling, and find facilities with published information for your item.",
    },
  ])
  const [demoProfile, setDemoProfile] = useState<DemoProfile | null>(null)
  const [userName, setUserName] = useState("Raven")
  const [userType, setUserType] = useState("Household")
  const [category, setCategory] = useState("Laptop")
  const [device, setDevice] = useState("Old Laptop")
  const [condition, setCondition] = useState("Broken")
  const [quantity, setQuantity] = useState("1")
  const [itemLocation, setItemLocation] = useState("Quezon City")
  const [analyzed, setAnalyzed] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState("")
  const [selectedFacility, setSelectedFacility] = useState<Facility>(
    facilities[0],
  )
  const [returnPage, setReturnPage] = useState<Page>("facilities")
  const [saved, setSaved] = useState<string[]>([facilities[1].name])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All categories")
  const [locationFilter, setLocationFilter] = useState("All locations")
  const [daysFilter, setDaysFilter] = useState("Any operating day")
  const [article, setArticle] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  const upload = useRef<HTMLInputElement>(null)
  const chatEnd = useRef<HTMLDivElement>(null)

  const go = (next: Page) => {
    location.hash = next
    setPage(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: "instant" })
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
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo)
    },
    [photo],
  )

  const normalizedCategory =
    category === "Laptop" || category === "Computer Parts"
      ? "Computer Equipment"
      : category
  const normalizedSearch = search
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  const openFacility = (facility: Facility, from: Page) => {
    setSelectedFacility(facility)
    setReturnPage(from)
    go("facility")
  }
  const toggleSaved = (facility: Facility) => {
    const isSaved = saved.includes(facility.name)
    setSaved((current) =>
      isSaved
        ? current.filter((name) => name !== facility.name)
        : [...current, facility.name],
    )
    setNotice(
      isSaved
        ? "Facility removed from saved facilities."
        : "Facility saved to your dashboard.",
    )
  }
  const sendMessage = async (text = chatInput) => {
    const question = text.trim()
    if (!question || isSending) return
    setMessages((current) => [...current, { role: "user", text: question }])
    setChatInput("")
    setIsSending(true)

    try {
      const apiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })
      const result: { answer?: string; error?: string } = await apiResponse.json()
      if (!apiResponse.ok) {
        throw new Error(result.error || `Request failed (${apiResponse.status}).`)
      }
      const answer = result.answer
      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("EcoBot returned an invalid response.")
      }
      setMessages((current) => [...current, { role: "bot", text: answer }])
    } catch (error) {
      console.error("EcoBot could not answer the question:", error)
      setMessages((current) => [
        ...current,
        {
          role: "bot",
          text: "Sorry, EcoBot could not reach its project knowledge API. Please try again in a moment.",
        },
      ])
    } finally {
      setIsSending(false)
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
    { page: "recommendations", label: "AI Recommendations", icon: "sparkles" },
    { page: "facilities", label: "Facility Directory", icon: "pin" },
    { page: "learn", label: "Educational Resources", icon: "book" },
    { page: "profile", label: "Profile", icon: "user" },
  ]

  const FacilityCard = ({
    facility,
    from = "facilities" as Page,
  }: {
    facility: Facility
    from?: Page
  }) => (
    <article className="facility-card" key={facility.name}>
      <div className="facility-card-top">
        <span className="feature-icon">
          <Icon name={facility.icon} size={25} />
        </span>
        <Badge>
          <Icon name="shield" size={12} /> Accredited
        </Badge>
      </div>
      <h3>{facility.name}</h3>
      <p className="icon-line">
        <Icon name="pin" size={16} />
        {facility.location}
      </p>
      <p className="facility-description">{facility.description}</p>
      <div className="tags">
        {facility.items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="facility-info">
        <span>
          <Icon name="clock" size={16} />
          {facility.days}
        </span>
        <span>{facility.hours}</span>
      </div>
      <div className="card-actions">
        <Button
          variant="secondary"
          onClick={() => openFacility(facility, from)}
        >
          View Details
        </Button>
        <Button variant="text" onClick={() => toggleSaved(facility)}>
          <Icon
            name={saved.includes(facility.name) ? "check" : "heart"}
            size={17}
          />
          {saved.includes(facility.name) ? "Saved" : "Save Facility"}
        </Button>
      </div>
    </article>
  )

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
              { page: "recommendations", label: "AI Recommendations" },
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
            onClick={() => go("login")}
          >
            <Icon name="user" size={17} />
            Login / Register
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
                  responsibly, and use EcoBot AI to explore suitable accredited
                  facilities.
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
                    Accredited facility information
                  </span>
                  <span>
                    <Icon name="sparkles" size={17} />
                    AI-powered guidance
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
                  <Icon name="battery" size={38} />
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
                EcoBot helps you understand the item first,
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
                <h3>Get an AI recommendation</h3>
                <p>
                  See how item, hazard, location, and facility rules shape the
                  recommendation.
                </p>
                <span className="card-link">
                  View recommendation
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
                <h2>Meet EcoBot, your e-waste guide.</h2>
                <Badge tone="blue">AI ASSISTANT</Badge>
              </div>
              <p>
                Ask about categories, hazard classifications, handling guidance,
                accepted items, locations, or published operating hours.
              </p>
            </div>
            <Button onClick={() => setChatOpen(true)}>
              Ask EcoBot
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
                  EcoBot can explain items, hazards, and facility information.
                </p>
                <button onClick={() => setChatOpen(true)}>
                  Ask EcoBot
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </aside>
          )}
          <main
            className={`page-content ${page === "login" ? "auth-content" : ""}`}
          >
            {page === "login" && (
              <AuthPage
                illustration={<Icon name="recycle" size={110} />}
                shield={<Icon name="shield" />}
                onLogin={(email) => {
                  const profile = demoProfile?.email === email ? demoProfile : null
                  setUserName(profile?.fullName ?? "Demo User")
                  setUserType(profile?.userType ?? "General User")
                  go("dashboard")
                  setNotice("Welcome! You are signed in to a demo session.")
                }}
                onRegister={(profile) => {
                  setDemoProfile(profile)
                  setUserName(profile.fullName)
                  setUserType(profile.userType)
                  go("dashboard")
                  setNotice("Demo registration complete. Welcome to your workspace!")
                }}
                onGuest={() => {
                  setUserName("Guest")
                  setUserType("General User")
                  go("dashboard")
                  setNotice("You are exploring EcoAgent as a guest.")
                }}
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
                      value: "5",
                      label: "Registered E-Waste Items",
                      sub: "Identified or saved electronics",
                      page: "items" as Page,
                    },
                    {
                      icon: "sparkles" as IconName,
                      value: "3",
                      label: "AI Recommendations",
                      sub: "EcoBot facility suggestions",
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
                      value: "5",
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
                <section className="panel dashboard-assistant">
                  <div className="assistant-intro">
                    <span className="bot-avatar">
                      <Icon name="robot" size={38} />
                    </span>
                    <div>
                      <Badge tone="blue">ECOBOT AI ASSISTANT</Badge>
                      <h2>Ask a question about your e-waste.</h2>
                      <p>
                        Get clear explanations based on item categories and
                        available facility information.
                      </p>
                    </div>
                  </div>
                  <div className="assistant-conversation">
                    <div className="conversation-row user-row">
                      <strong>User</strong>
                      <p>Where can I dispose of my old laptop?</p>
                    </div>
                    <div className="conversation-row bot-row">
                      <strong>EcoBot AI</strong>
                      <p>
                        Your old laptop belongs to the computer equipment
                        category. I recommend GreenTech Recycling Center because
                        its facility information indicates that it accepts
                        laptops. You can view its location, accepted items, and
                        operating hours to learn more.
                      </p>
                    </div>
                  </div>
                  <div className="assistant-actions">
                    <Button onClick={() => setChatOpen(true)}>
                      Continue with EcoBot
                      <Icon name="sparkles" size={17} />
                    </Button>
                    <Button variant="secondary" onClick={() => go("identify")}>
                      Identify E-Waste
                    </Button>
                  </div>
                </section>
                <p className="demo-note">
                  Dashboard counts and recommendations are illustrative
                  prototype data.
                </p>
              </>
            )}

            {page === "identify" && (
              <>
                {title(
                  "A RESPONSIBLE FIRST STEP",
                  "Identify your electronic waste",
                  "Search for an item or enter its details to receive category, hazard, and safe-handling guidance.",
                )}
                <div className="workflow-steps">
                  <span className="current">
                    1 <b>Identify e-waste</b>
                  </span>
                  <i />
                  <span>
                    2 <b>AI analysis</b>
                  </span>
                  <i />
                  <span>
                    3 <b>Facility recommendation</b>
                  </span>
                  <i />
                  <span>
                    4 <b>Facility details</b>
                  </span>
                </div>
                <div className="two-column">
                  <section className="panel">
                    <h2>Tell us about your item</h2>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        setAnalyzed(true)
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
                            placeholder="Search for a laptop, phone, charger…"
                          />
                        </div>
                      </Field>
                      <div
                        className="upload-zone"
                        onClick={() => upload.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ")
                            upload.current?.click()
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <input
                          ref={upload}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              setPhoto(URL.createObjectURL(file))
                              setPhotoName(file.name)
                            }
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
                            : "JPG, PNG or WEBP"}
                        </span>
                      </div>
                      <Field label="Item Category">
                        <select
                          value={category}
                          onChange={(event) => {
                            setCategory(event.target.value)
                            setAnalyzed(false)
                          }}
                        >
                          <option>Laptop</option>
                          <option>Mobile Phone</option>
                          <option>Charger</option>
                          <option>Battery</option>
                          <option>Computer Parts</option>
                          <option>Other Electronics</option>
                        </select>
                      </Field>
                      <Field label="Item Name">
                        <input
                          required
                          value={device}
                          onChange={(event) => setDevice(event.target.value)}
                          placeholder="e.g. Old Laptop"
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Condition">
                          <select
                            value={condition}
                            onChange={(event) =>
                              setCondition(event.target.value)
                            }
                          >
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
                            value={quantity}
                            onChange={(event) =>
                              setQuantity(event.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Location for Facility Recommendations">
                        <input
                          required
                          value={itemLocation}
                          onChange={(event) =>
                            setItemLocation(event.target.value)
                          }
                          placeholder="City or area"
                        />
                      </Field>
                      <Button type="submit" className="full-width">
                        <Icon name="sparkles" size={18} />
                        Analyze E-Waste
                      </Button>
                    </form>
                  </section>
                  <div>
                    <section className="panel analysis-panel">
                      <div className="panel-heading">
                        <div className="heading-with-icon">
                          <span className="feature-icon blue">
                            <Icon name="robot" size={27} />
                          </span>
                          <h2>EcoBot AI Analysis</h2>
                        </div>
                        <Badge tone="blue">AI GUIDE</Badge>
                      </div>
                      {analyzed ? (
                        <>
                          <div className="analysis-ready">
                            <Icon name="check" size={18} />
                            Analysis complete
                          </div>
                          <dl className="analysis-list">
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
                                Potentially hazardous electronic waste,
                                depending on its components and condition.
                              </dd>
                            </div>
                            <div>
                              <dt>Handling Guidance</dt>
                              <dd>
                                Handle the device carefully. Avoid opening
                                damaged batteries or electronic components.
                                Consult appropriate disposal guidance and an
                                accredited facility.
                              </dd>
                            </div>
                            <div>
                              <dt>Item Details</dt>
                              <dd>
                                {condition} · {quantity} item(s)
                              </dd>
                            </div>
                          </dl>
                          <Button
                            className="full-width"
                            onClick={() => go("recommendations")}
                          >
                            Find Suitable Facilities
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
                        Prototype guidance uses entered details, not image
                        recognition. Consult appropriate safety guidance for
                        damaged items.
                      </p>
                    </section>
                    <div className="safety-note">
                      <Icon name="robot" size={23} />
                      <div>
                        <strong>EcoBot is available here.</strong>
                        <p>
                          Ask about categories, hazards, handling, or accepted
                          items.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setChatOpen(true)}
                      >
                        Ask EcoBot
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {page === "recommendations" && (
              <>
                {title(
                  "INTELLIGENCE WITH PURPOSE",
                  "AI facility recommendation",
                  "EcoBot connects your item information with published facility details and explains its reasoning.",
                )}
                <div className="explanation-card">
                  <span className="feature-icon blue">
                    <Icon name="robot" size={30} />
                  </span>
                  <div>
                    <h3>EcoBot reviews the information that matters.</h3>
                    <p>
                      Identified item and category, hazard classification,
                      facility acceptance rules, location, and published
                      operating days and hours.
                    </p>
                    <div className="tags">
                      <span>{device}</span>
                      <span>{normalizedCategory}</span>
                      <span>{itemLocation}</span>
                    </div>
                  </div>
                  <Badge tone="blue">EXPLAINABLE AI</Badge>
                </div>
                <section className="panel recommendation-feature">
                  <div className="recommendation-label">
                    <span className="feature-icon blue">
                      <Icon name="sparkles" size={27} />
                    </span>
                    <div>
                      <span className="eyebrow">ECOBOT AI RECOMMENDATION</span>
                      <h2>{facilities[0].name}</h2>
                    </div>
                  </div>
                  <div className="recommendation-reason">
                    <h3>Why this facility?</h3>
                    <p>
                      EcoBot selected this facility because the available
                      facility information indicates that it accepts the
                      identified e-waste category.
                    </p>
                  </div>
                  <dl className="analysis-list recommendation-details">
                    <div>
                      <dt>Location</dt>
                      <dd>{facilities[0].location}</dd>
                    </div>
                    <div>
                      <dt>Accepted E-Waste Items</dt>
                      <dd>{facilities[0].items.join(", ")}</dd>
                    </div>
                    <div>
                      <dt>Operating Days</dt>
                      <dd>{facilities[0].days}</dd>
                    </div>
                    <div>
                      <dt>Operating Hours</dt>
                      <dd>{facilities[0].hours}</dd>
                    </div>
                    <div>
                      <dt>Relevant Facility Information</dt>
                      <dd>{facilities[0].description}</dd>
                    </div>
                  </dl>
                  <div className="assistant-actions">
                    <Button
                      onClick={() =>
                        openFacility(facilities[0], "recommendations")
                      }
                    >
                      View Facility
                      <Icon name="arrow" size={17} />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setChatOpen(true)}
                    >
                      Ask EcoBot Why
                    </Button>
                  </div>
                </section>
                <p className="demo-note">
                  This recommendation uses illustrative facility information. It
                  does not represent real-time availability. Verify facility
                  information directly before visiting.
                </p>
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
                      placeholder="Search facility or location"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                  >
                    <option>All locations</option>
                    {[...new Set([
                      ...collectionLocations.map((entry) => entry.municipality),
                      "Marikina City",
                      "Pasig City",
                    ])]
                      .sort((a, b) => a.localeCompare(b))
                      .map((municipality) => (
                        <option key={municipality}>{municipality}</option>
                      ))}
                  </select>
                  <select
                    aria-label="Filter sample facilities by accepted category"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option>All categories</option>
                    <option>Laptops</option>
                    <option>Mobile phones</option>
                    <option>Batteries</option>
                    <option>Chargers</option>
                    <option>Computer parts</option>
                  </select>
                  <select
                    aria-label="Filter sample facilities by operating days"
                    value={daysFilter}
                    onChange={(event) => setDaysFilter(event.target.value)}
                  >
                    <option>Any operating day</option>
                    <option>Weekdays</option>
                    <option>Saturday</option>
                  </select>
                </div>
                <section className="collection-options" aria-labelledby="collection-options-title">
                  <div className="section-heading">
                    <h2 id="collection-options-title">Community collection options</h2>
                    <span className="muted">Metro Manila</span>
                  </div>
                  <p className="demo-note">
                    Listings and status notes are based on information provided
                    for this project and have not been independently verified.
                    Confirm that a collection point is operating, open to the
                    public, and accepts your item before visiting.
                  </p>
                  <div className="collection-location-grid">
                    {collectionLocations
                      .filter(
                        (entry) =>
                          (locationFilter === "All locations" ||
                            entry.municipality === locationFilter) &&
                          `${entry.municipality} ${entry.locations
                            .map((location) => `${location.operator} ${location.name} ${location.status}`)
                            .join(" ")}`
                              .normalize("NFD")
                              .replace(/\p{Diacritic}/gu, "")
                              .toLowerCase()
                              .includes(normalizedSearch),
                      )
                      .map((entry) => (
                        <article
                          className="collection-location-card"
                          key={entry.municipality}
                        >
                          <h3>{entry.municipality}</h3>
                          <ul>
                            {entry.locations.map((location) => (
                              <li key={`${location.operator}-${location.name}`}>
                                <strong>{location.name}</strong>
                                <span>{location.operator}</span>
                                <small>{location.status}</small>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                  </div>
                </section>
                <div className="directory-label">
                  <span>Review published facility information.</span>
                  <span>
                    <Icon name="shield" size={16} />
                    Illustrative accredited facilities
                  </span>
                </div>
                <div className="facility-grid">
                  {facilities
                    .filter(
                      (facility) =>
                        `${facility.name} ${facility.location}`
                          .normalize("NFD")
                          .replace(/\p{Diacritic}/gu, "")
                          .toLowerCase()
                          .includes(normalizedSearch) &&
                        (locationFilter === "All locations" ||
                          facility.location.includes(locationFilter)) &&
                        (filter === "All categories" ||
                          facility.items.includes(filter)) &&
                        (daysFilter === "Any operating day" ||
                          (daysFilter === "Saturday"
                            ? facility.days.includes("Saturday")
                            : facility.days.includes("Monday"))),
                    )
                    .map((facility) => (
                      <FacilityCard key={facility.name} facility={facility} />
                    ))}
                </div>
                <div className="safety-note">
                  <Icon name="robot" size={25} />
                  <div>
                    <strong>
                      Not sure which facility information to review?
                    </strong>
                    <p>
                      EcoBot can compare your item category with published
                      accepted-item information.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setChatOpen(true)}>
                    Ask EcoBot
                  </Button>
                </div>
                <p className="demo-note">
                  The facility cards below are illustrative examples. Community
                  collection options above reflect project-provided listings;
                  verify status, access, accepted items, and schedules directly.
                </p>
              </>
            )}

            {page === "facility" && (
              <>
                {title(
                  "FACILITY INFORMATION",
                  selectedFacility.name,
                  "Review accepted items, location, operating information, and important guidance before making your own arrangements.",
                )}
                <div className="facility-detail-layout">
                  <section className="panel facility-detail-main">
                    <div className="facility-detail-header">
                      <span className="feature-icon">
                        <Icon name={selectedFacility.icon} size={31} />
                      </span>
                      <div>
                        <Badge>
                          <Icon name="shield" size={13} />
                          Accredited facility example
                        </Badge>
                        <h2>{selectedFacility.name}</h2>
                        <p className="icon-line">
                          <Icon name="pin" size={17} />
                          {selectedFacility.location}
                        </p>
                      </div>
                    </div>
                    <p className="facility-lead">
                      {selectedFacility.description}
                    </p>
                    <dl className="analysis-list">
                      <div>
                        <dt>Accepted Items</dt>
                        <dd>
                          <ul className="accepted-list">
                            {selectedFacility.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div>
                        <dt>Operating Days</dt>
                        <dd>{selectedFacility.days}</dd>
                      </div>
                      <div>
                        <dt>Operating Hours</dt>
                        <dd>{selectedFacility.hours}</dd>
                      </div>
                      <div>
                        <dt>Important Information</dt>
                        <dd>{selectedFacility.info}</dd>
                      </div>
                    </dl>
                    <div className="assistant-actions">
                      <Button onClick={() => toggleSaved(selectedFacility)}>
                        <Icon
                          name={
                            saved.includes(selectedFacility.name)
                              ? "check"
                              : "heart"
                          }
                          size={17}
                        />
                        {saved.includes(selectedFacility.name)
                          ? "Facility Saved"
                          : "Save Facility"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => go(returnPage)}
                      >
                        <Icon name="arrow" className="back-arrow" size={17} />
                        {returnPage === "recommendations"
                          ? "Back to Recommendations"
                          : "Back to Directory"}
                      </Button>
                    </div>
                  </section>
                  <aside className="panel facility-bot-card">
                    <span className="bot-avatar">
                      <Icon name="robot" size={38} />
                    </span>
                    <Badge tone="blue">ECOBOT AI</Badge>
                    <h2>Questions about this facility?</h2>
                    <p>
                      Ask EcoBot to explain accepted items, the published
                      location, or operating hours.
                    </p>
                    <Button onClick={() => setChatOpen(true)}>
                      Ask EcoBot
                      <Icon name="sparkles" size={17} />
                    </Button>
                  </aside>
                </div>
                <p className="demo-note">
                  This is illustrative facility information. Contact the
                  facility directly to verify details that may have changed.
                </p>
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
                      EcoBot can explain e-waste terms and responsible handling
                      guidance.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setChatOpen(true)}>
                    Ask EcoBot
                  </Button>
                </div>
              </>
            )}

            {page === "flow" && (
              <>
                {title(
                  "INTELLIGENCE WITH PURPOSE",
                  "How EcoBot connects the dots",
                  "A transparent view of the intelligent agent's information and facility recommendation process.",
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
                      "EcoBot explains the item",
                      "Category, hazard classification, and safe handling guidance",
                      "robot" as IconName,
                    ],
                    [
                      "03 · FACILITY REVIEW",
                      "Published information is compared",
                      "Acceptance rules, location, operating days, and operating hours",
                      "search" as IconName,
                    ],
                    [
                      "04 · RECOMMENDATION",
                      "A suitable facility is explained",
                      "A transparent reason based on available facility information",
                      "sparkles" as IconName,
                    ],
                    [
                      "05 · DETAILS",
                      "User reviews facility information",
                      "Accepted items, location, hours, and important guidance",
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
                    Try EcoBot Analysis
                    <Icon name="arrow" size={17} />
                  </Button>
                </div>
              </>
            )}

            {page === "items" && (
              <>
                {title(
                  "YOUR IDENTIFIED ELECTRONICS",
                  "Registered e-waste items",
                  "Review electronic items you have identified or saved for future reference.",
                )}
                <div className="toolbar">
                  <Badge>5 demo electronic items</Badge>
                  <Button onClick={() => go("identify")}>
                    <Icon name="plus" size={17} />
                    Identify an Item
                  </Button>
                </div>
                <div className="facility-grid">
                  {[
                    ["Old Laptop", "Computer Equipment", "Broken", "laptop"],
                    ["Personal Phone", "Mobile Phone", "Working", "phone"],
                    ["Spare Charger", "Charger", "Working", "box"],
                    ["Wireless Keyboard", "Computer Parts", "Damaged", "box"],
                    ["Tablet Battery", "Battery", "Unknown", "battery"],
                  ].map(([name, itemCategory, itemCondition, icon]) => (
                    <section className="facility-card" key={name}>
                      <div className="facility-card-top">
                        <span className="feature-icon">
                          <Icon name={icon as IconName} size={27} />
                        </span>
                        <Badge tone="gray">Saved item</Badge>
                      </div>
                      <h3>{name}</h3>
                      <p>
                        {itemCategory} · {itemCondition} · 1 item
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDevice(name)
                          setCategory(
                            itemCategory === "Computer Equipment"
                              ? "Laptop"
                              : itemCategory,
                          )
                          setCondition(itemCondition)
                          setAnalyzed(true)
                          go("identify")
                        }}
                      >
                        View Analysis
                        <Icon name="arrow" size={16} />
                      </Button>
                    </section>
                  ))}
                </div>
              </>
            )}

            {page === "profile" && (
              <>
                {title(
                  "YOUR ECOAGENT ACCOUNT",
                  "Your profile",
                  "Keep the basic information that personalizes your facility recommendations.",
                )}
                <section className="panel profile-panel">
                  <div className="profile-avatar">{userName[0]}</div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      setNotice("Profile updated for this demo session.")
                    }}
                  >
                    <Field label="Full Name">
                      <input
                        required
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
                    <Field label="Location">
                      <input
                        required
                        value={itemLocation}
                        onChange={(event) =>
                          setItemLocation(event.target.value)
                        }
                      />
                    </Field>
                    <Button type="submit">
                      Save Changes
                      <Icon name="check" size={17} />
                    </Button>
                  </form>
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
            <button onClick={() => go("flow")}>How EcoBot Works</button>
            <button onClick={() => go("dashboard")}>My Dashboard</button>
            <button onClick={() => go("facilities")}>Facility Directory</button>
            <span>© {new Date().getFullYear()} EcoAgent</span>
          </div>
        </div>
      </footer>

      <button
        className={`chat-launcher ${chatOpen ? "is-open" : ""}`}
        onClick={() => setChatOpen(!chatOpen)}
        aria-label={chatOpen ? "Close EcoBot chat" : "Ask EcoBot"}
      >
        <Icon name={chatOpen ? "close" : "robot"} size={23} />
        {!chatOpen && <span>Ask EcoBot</span>}
        {!chatOpen && <span className="chat-live" />}
      </button>
      {chatOpen && (
        <section className="chat-panel" aria-label="EcoBot assistant">
          <div className="chat-header">
            <span className="chat-bot-icon">
              <Icon name="robot" size={25} />
            </span>
            <div>
              <strong>EcoBot Project Assistant</strong>
              <small>
                <span className="live-dot" aria-hidden="true" />
                Project e-waste guidance
              </small>
            </div>
            <button onClick={() => setChatOpen(false)} aria-label="Close chat">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="EcoBot conversation"
          >
            {messages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={index}>
                {message.role === "bot" && <Icon name="robot" size={19} />}
                <p>{message.text}</p>
              </div>
            ))}
            {isSending && (
              <p className="chat-status" role="status" aria-live="polite">
                EcoBot is preparing an answer…
              </p>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="chat-shortcuts">
            <button
              disabled={isSending}
              onClick={() =>
                sendMessage(
                  "I have an old broken laptop. Where should I bring it?",
                )
              }
            >
              Ask about a laptop
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
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about your electronics…"
              aria-label="Message EcoBot"
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
            Answers use project guidance · Verify facility details directly
          </div>
        </section>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={20} />
          {notice}
        </div>
      )}
    </div>
  )
}
