import { useEffect, useRef, useState } from "react"
import { authRequest } from "./authApi"
import type { AccountProfile } from "./authValidation"
import type { FacilityRecord } from "../identification/facilityRecommendations.mjs"

export type SavedFacility = FacilityRecord & { municipality: string }
export type SavedItem = {
  id: number; clientKey: string; name: string; category: string; condition: string;
  quantity: number; analysisKind: "manual" | "photo"; photoCondition: string | null; createdAt: string
}
type Workspace = { items: SavedItem[]; savedFacilities: SavedFacility[] }
const empty: Workspace = { items: [], savedFacilities: [] }

export function useAccountWorkspace(user: AccountProfile | null) {
  const owner = user?.id
  const ownerRef = useRef(owner)
  const mutationRevision = useRef(0)
  ownerRef.current = owner
  const [state, setState] = useState<{ owner?: number; data: Workspace }>({ data: empty })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const stamp = mutationRevision.current
    setError("")
    setBusy(false)
    if (!owner) { setState({ data: empty }); setLoading(false); return }
    setLoading(true)
    authRequest<Workspace>("/api/account/data", undefined, owner)
      .then((data) => { if (active && stamp === mutationRevision.current) setState({ owner, data }) })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Unable to load your workspace.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [owner, revision])

  async function update(path: string, body: Record<string, unknown>) {
    if (!owner) throw new Error("Sign in to save to your account.")
    mutationRevision.current += 1
    setBusy(true)
    try {
      const data = await authRequest<Workspace>(path, body, owner)
      if (ownerRef.current === owner) { setState({ owner, data }); setError("") }
    } finally {
      if (ownerRef.current === owner) setBusy(false)
    }
  }
  const data = state.owner === owner && owner ? state.data : empty
  return { ...data, loading, busy, error, update, reload: () => setRevision((v) => v + 1) }
}
