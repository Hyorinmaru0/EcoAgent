import { useState } from "react"
import { AuthSubmitButton, CheckboxField, PasswordField, TextField } from "./AuthFields"
import { passwordHint, validateLogin } from "./authValidation"
import { readRememberedEmail, rememberEmail } from "./rememberEmail"
import { useAuthForm } from "./useAuthForm"

export function LoginForm({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [requestError, setRequestError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [rememberedEmail] = useState(readRememberedEmail)
  const { values, errors, setField, blurField, submit } = useAuthForm(
    { email: rememberedEmail, password: "", remember: Boolean(rememberedEmail) },
    validateLogin,
  )

  return (
    <form noValidate onSubmit={submit((credentials) => {
      const email = credentials.email.trim().toLowerCase()
      rememberEmail(email, credentials.remember)
      setSubmitting(true)
      setRequestError("")
      void onLogin(email, credentials.password)
        .catch((error: unknown) => setRequestError(error instanceof Error ? error.message : "Unable to log in."))
        .finally(() => setSubmitting(false))
    })} aria-label="Login">
      <TextField
        id="login-email" name="email" label="Email Address" type="email"
        autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
        placeholder="you@example.com" required maxLength={254}
        value={values.email} onChange={(event) => setField("email", event.target.value)}
        onBlur={() => blurField("email")} error={errors.email}
      />
      <PasswordField
        id="login-password" name="password" label="Password" autoComplete="current-password"
        placeholder="Enter your password" required minLength={8} maxLength={128} hint={passwordHint}
        value={values.password} onChange={(event) => setField("password", event.target.value)}
        onBlur={() => blurField("password")} error={errors.password}
      />
      <CheckboxField
        id="login-remember" name="remember" checked={values.remember}
        onChange={(event) => setField("remember", event.target.checked)}
        hint="Remember only my email on this device."
      >
        Remember Me
      </CheckboxField>
      {requestError && <p className="auth-error" role="alert">{requestError}</p>}
      <AuthSubmitButton disabled={submitting}>{submitting ? "Signing in…" : "Login"}</AuthSubmitButton>
    </form>
  )
}
