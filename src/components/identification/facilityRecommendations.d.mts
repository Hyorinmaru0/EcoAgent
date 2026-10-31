export type Coordinates = { latitude: number; longitude: number }

export type FacilityRecord = {
  name: string
  operator: string
  acceptedDevices: string
  status: string
  address?: string
  coordinates?: Coordinates
  operatingHours?: { days: string; opens: string; closes: string }[]
}

export type FacilityRecommendation = FacilityRecord & {
  municipality: string
  acceptanceLabel: string
  distanceKm: number | null
}

export function isValidCoordinates(point: unknown): point is Coordinates
export function distanceKmBetween(from: Coordinates | null, to?: Coordinates): number | null

export function getFacilityRecommendations(
  locations: { municipality: string; locations: FacilityRecord[] }[],
  category: string,
  userLocation?: Coordinates | null,
): FacilityRecommendation[]
