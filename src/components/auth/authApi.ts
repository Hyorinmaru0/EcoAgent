export async function authRequest<T>(path: string, body?: Record<string, unknown>, expectedUserId?: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(expectedUserId ? { "X-EcoCycle-Account": String(expectedUserId) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = await response.json().catch(() => null) as ({ error?: string } & T) | null
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The account service returned an invalid response. Please reload and try again.")
    if (!response.ok) throw new Error(result.error || "The account service is temporarily unavailable.")
    if (path === "/api/account/data" || (path.startsWith("/api/account/") && path !== "/api/account/profile")) {
      const workspace = result as { items?: unknown; savedFacilities?: unknown }
      if (!Array.isArray(workspace.items) || !Array.isArray(workspace.savedFacilities)) throw new Error("The account service returned invalid saved data. Please reload and try again.")
    }
    if (["/api/auth/me", "/api/auth/login", "/api/auth/register", "/api/account/profile"].includes(path)) {
      const { user } = result as { user?: { id?: unknown; fullName?: unknown; email?: unknown; userType?: unknown } | null }
      if (!(path === "/api/auth/me" && user === null) && (!user || !Number.isSafeInteger(user.id) ||
          typeof user.fullName !== "string" || typeof user.email !== "string" || !["Student", "Household", "General User"].includes(String(user.userType)))) {
        throw new Error("The account service returned invalid account details. Please reload and try again.")
      }
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The account request timed out. Reload to check your account before trying again.")
    if (error instanceof TypeError) throw new Error("Could not connect to the account service. Check your connection and try again.")
    throw error
  } finally {
    clearTimeout(timer)
  }
}
