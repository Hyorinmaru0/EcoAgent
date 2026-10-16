type EmailStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export const rememberedEmailKey = "ecocycle.rememberedEmail"

export function readRememberedEmail(storage?: EmailStorage): string {
  try {
    const email = (storage ?? window.localStorage).getItem(rememberedEmailKey) ?? ""
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
  } catch {
    return ""
  }
}

export function rememberEmail(email: string, remember: boolean, storage?: EmailStorage) {
  try {
    const target = storage ?? window.localStorage
    if (remember) target.setItem(rememberedEmailKey, email.trim().toLowerCase())
    else target.removeItem(rememberedEmailKey)
  } catch {
    // Restricted browser storage must not prevent demo access.
  }
}
