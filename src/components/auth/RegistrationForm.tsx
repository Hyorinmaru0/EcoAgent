import { useState } from "react"
import { AuthSubmitButton, CheckboxField, FieldError, PasswordField, TextField } from "./AuthFields"
import { createAccountProfile, passwordHint, userTypes, validateRegistration, type AccountProfile } from "./authValidation"
import { useAuthForm } from "./useAuthForm"

export function RegistrationForm({ onRegister }: { onRegister: (profile: AccountProfile, password: string) => Promise<void> }) {
  const [requestError, setRequestError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { values, errors, setField, blurField, submit } = useAuthForm(
    { fullName: "", email: "", password: "", confirmPassword: "", userType: "", terms: false },
    validateRegistration,
  )

  return (
    <form noValidate onSubmit={submit((details) => {
      setSubmitting(true)
      setRequestError("")
      void onRegister(createAccountProfile(details), details.password)
        .catch((error: unknown) => setRequestError(error instanceof Error ? error.message : "Unable to create your account."))
        .finally(() => setSubmitting(false))
    })} aria-label="Create an account">
      <TextField
        id="register-name" name="fullName" label="Full Name" autoComplete="name"
        placeholder="Your full name" required minLength={2} maxLength={100}
        value={values.fullName} onChange={(event) => setField("fullName", event.target.value)}
        onBlur={() => blurField("fullName")} error={errors.fullName}
      />
      <TextField
        id="register-email" name="email" label="Email Address" type="email"
        autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
        placeholder="you@example.com" required maxLength={254}
        value={values.email} onChange={(event) => setField("email", event.target.value)}
        onBlur={() => blurField("email")} error={errors.email}
      />
      <PasswordField
        id="register-password" name="password" label="Password" autoComplete="new-password"
        placeholder="Create a password" required minLength={8} maxLength={128} hint={passwordHint}
        value={values.password} onChange={(event) => setField("password", event.target.value)}
        onBlur={() => blurField("password")} error={errors.password}
      />
      <PasswordField
        id="register-confirm" name="confirmPassword" label="Confirm Password" autoComplete="new-password"
        placeholder="Re-enter your password" required minLength={8} maxLength={128}
        value={values.confirmPassword} onChange={(event) => setField("confirmPassword", event.target.value)}
        onBlur={() => blurField("confirmPassword")} error={errors.confirmPassword}
      />
      <div className="field auth-field">
        <label htmlFor="register-user-type">User Type</label>
        <select
          id="register-user-type" name="userType" required
          value={values.userType} onChange={(event) => setField("userType", event.target.value)}
          onBlur={() => blurField("userType")} aria-invalid={Boolean(errors.userType)}
          aria-describedby={errors.userType ? "register-user-type-error" : undefined}
        >
          <option value="" disabled>Select your user type</option>
          {userTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <FieldError id="register-user-type-error" error={errors.userType} />
      </div>
      <details className="auth-terms">
        <summary>Account information</summary>
        <p>Your profile, saved item summaries, facility bookmarks, and a securely hashed password are stored in this project's database. Saving an analysis keeps its text summary, not the uploaded photo.</p>
      </details>
      <CheckboxField
        id="register-terms" name="terms" required checked={values.terms}
        onChange={(event) => setField("terms", event.target.checked)}
        onBlur={() => blurField("terms")} error={errors.terms}
      >
        I understand how my account information is stored.
      </CheckboxField>
      {requestError && <p className="auth-error" role="alert">{requestError}</p>}
      <AuthSubmitButton disabled={submitting}>{submitting ? "Creating account…" : "Create Account"}</AuthSubmitButton>
    </form>
  )
}
