import { useState, type ReactNode } from "react"
import { LoginForm } from "./LoginForm"
import { RegistrationForm } from "./RegistrationForm"
import type { AccountProfile } from "./authValidation"
import "./auth.css"

type AuthPageProps = {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (profile: AccountProfile, password: string) => Promise<void>
  onGuest: () => void
  illustration: ReactNode
  shield: ReactNode
}

export function AuthPage({ onLogin, onRegister, onGuest, illustration, shield }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const register = mode === "register"

  return (
    <div className="auth-layout module-auth">
      <div className="auth-intro">
        <span className="eyebrow">YOUR NEXT RESPONSIBLE CHOICE</span>
        <h1>Good information.<br /><span>Better decisions.</span></h1>
        <p>Save identified items, analysis summaries, and collection facilities in your personal workspace.</p>
        <div className="auth-leaf">{illustration}</div>
        <div className="auth-proof">{shield}Your data remains yours.</div>
      </div>
      <div className="auth-card">
        <div className="auth-tabs" aria-label="Account access">
          <button type="button" className={!register ? "selected" : ""} aria-pressed={!register} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={register ? "selected" : ""} aria-pressed={register} onClick={() => setMode("register")}>
            Create an account
          </button>
        </div>
        <h2>{register ? "Create your workspace." : "Welcome back."}</h2>
        <p>{register ? "Save helpful information for future reference." : "Continue learning about responsible e-waste disposal."}</p>
        {register ? <RegistrationForm onRegister={onRegister} /> : <LoginForm onLogin={onLogin} />}
        <div className="auth-divider"><span />or<span /></div>
        <button type="button" className="btn btn-secondary full-width" onClick={onGuest}>Continue as Guest</button>
        <p className="demo-note">Account credentials are handled by the EcoAgent backend. You can also continue as a guest.</p>
      </div>
    </div>
  )
}
