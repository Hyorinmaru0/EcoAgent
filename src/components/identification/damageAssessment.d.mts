import type { DamageDetection, TvDetectionResult, VisualDamageEvidence } from "./useTvDetection"
export const DAMAGE_ACCEPTANCE_THRESHOLD: number
export function assessPhotoDamage(result: TvDetectionResult | null, category: string): {
  status: "blocked" | "damaged" | "not-run" | "uncertain"
  title: string
  description: string
  detection: DamageDetection | null
  source: string | null
  visualEvidence: VisualDamageEvidence | null
}
