export async function authRequest<T>(path: string, body?: Record<string, unknown>, expectedUserId?: number): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(expectedUserId ? { "X-EcoCycle-Account": String(expectedUserId) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({})) as { error?: string } & T
  if (!response.ok) throw new Error(result.error || "The account service is temporarily unavailable.")
  return result
}
