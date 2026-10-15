import { useState } from "react"
import { AuthSubmitButton, CheckboxField, PasswordField, TextField } from "./AuthFields"
import { passwordHint, validateLogin } from "./authValidation"
import { readRememberedEmail, rememberEmail } from "./rememberEmail"
import { useAuthForm } from "./useAuthForm"

export function LoginForm({ onLogin }: { onLogin: (email: string) => void }) {
  const [rememberedEmail] = useState(readRememberedEmail)
  const { values, errors, setField, blurField, submit } = useAuthForm(
    { email: rememberedEmail, password: "", remember: Boolean(rememberedEmail) },
    validateLogin,
  )

  return (
    <form noValidate onSubmit={submit((credentials) => {
      const email = credentials.email.trim().toLowerCase()
      rememberEmail(email, credentials.remember)
      onLogin(email)
    })} aria-label="Demo login">
      <TextField
        id="login-email" name="email" label="Email Address" type="email"
        autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
        placeholder="you@example.com" required
        value={values.email} onChange={(event) => setField("email", event.target.value)}
        onBlur={() => blurField("email")} error={errors.email}
      />
      <PasswordField
        id="login-password" name="password" label="Password" autoComplete="current-password"
        placeholder="Enter your password" required minLength={8} hint={passwordHint}
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
      <p className="auth-demo-info">Demo login accepts any email and password that meet the validation rules.</p>
      <AuthSubmitButton>Login</AuthSubmitButton>
    </form>
  )
}
