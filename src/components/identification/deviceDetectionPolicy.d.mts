import type { DeviceCategory, DeviceDetection } from "./useTvDetection"
export const DEVICE_ACCEPTANCE_THRESHOLD: number
export const DEVICE_AMBIGUITY_MARGIN: number
export const REFERENCE_ACCEPTANCE_THRESHOLD: number
export function assessDeviceDetections(detections: unknown, requestedCategory?: string): {
  status: "accepted" | "uncertain" | "no-match" | "ambiguous" | "mismatch" | "unverified"
  category: DeviceCategory | null
  detection: DeviceDetection | null
}
