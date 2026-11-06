export const userTypes = ["Student", "Household", "General User"] as const
export type UserType = (typeof userTypes)[number]

export type AccountProfile = {
  id?: number
  location?: string
  fullName: string
  email: string
  userType: UserType
}
export type DemoProfile = AccountProfile

export type LoginValues = {
  email: string
  password: string
  remember: boolean
}

export type RegistrationValues = {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  userType: string
  terms: boolean
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>

export const passwordHint = "Use 8–128 characters, including a letter and a number."

function emailError(email: string) {
  if (!email.trim()) return "Enter your email address."
  if (email.trim().length > 254) return "Use an email address with 254 characters or fewer."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Enter a valid email address, such as you@example.com."
}

function passwordError(password: string) {
  if (!password) return "Enter your password."
  if (password.length < 8 || password.length > 128 || !/[a-z]/i.test(password) || !/[0-9]/.test(password))
    return passwordHint
}

export function validateLogin(values: LoginValues): FieldErrors<LoginValues> {
  const errors: FieldErrors<LoginValues> = {}
  const email = emailError(values.email)
  const password = passwordError(values.password)
  if (email) errors.email = email
  if (password) errors.password = password
  return errors
}

export function validateRegistration(values: RegistrationValues): FieldErrors<RegistrationValues> {
  const errors: FieldErrors<RegistrationValues> = validateLogin({ ...values, remember: false })
  if (values.fullName.trim().length < 2 || values.fullName.trim().length > 100)
    errors.fullName = "Enter your full name (2–100 characters)."
  if (!values.confirmPassword) errors.confirmPassword = "Confirm your password."
  else if (values.password !== values.confirmPassword)
    errors.confirmPassword = "Your passwords do not match."
  if (!userTypes.some((type) => type === values.userType))
    errors.userType = "Select your user type."
  if (!values.terms) errors.terms = "Confirm how your account information is stored to continue."
  return errors
}

// Select only the public profile fields; the password is sent separately to the auth API.
export function createAccountProfile(values: RegistrationValues): AccountProfile {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    userType: values.userType as UserType,
  }
}
export const createDemoProfile = createAccountProfile
