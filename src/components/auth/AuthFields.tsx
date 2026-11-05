import { useState, type InputHTMLAttributes, type ReactNode } from "react"

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string
  hint?: string
  endAdornment?: ReactNode
}

export function TextField({ id, label, error, hint, endAdornment, ...input }: TextFieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ")
  return (
    <div className="field auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={endAdornment ? "auth-input-wrap" : undefined}>
        <input {...input} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy || undefined} />
        {endAdornment}
      </div>
      {hint && <p id={`${id}-hint`} className="auth-hint">{hint}</p>}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  )
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={id} className="auth-error" aria-live="polite">{error}</p> : null
}

export function AuthSubmitButton({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button className="btn btn-primary full-width" type="submit" disabled={disabled}>
      {children}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </svg>
    </button>
  )
}

export function PasswordField(props: Omit<TextFieldProps, "type" | "endAdornment">) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          className="auth-password-toggle"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${props.label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={props.id}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  )
}

type CheckboxFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  children: ReactNode
  error?: string
  hint?: string
}

export function CheckboxField({ id, children, error, hint, ...input }: CheckboxFieldProps) {
  return (
    <div className="auth-checkbox-field">
      <label className="checkbox" htmlFor={id}>
        <input
          {...input}
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error)}
          aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
        />
        <span>{children}</span>
      </label>
      {hint && <p id={`${id}-hint`} className="auth-hint">{hint}</p>}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  )
}
