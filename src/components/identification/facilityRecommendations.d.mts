type FacilityRecord = {
  name: string
  operator: string
  acceptedDevices: string
  status: string
  address?: string
  operatingHours?: { days: string; opens: string; closes: string }[]
}

type FacilityRecommendation = FacilityRecord & {
  municipality: string
  acceptanceLabel: string
  isLocal: boolean
}

export function getFacilityRecommendations(
  locations: { municipality: string; locations: FacilityRecord[] }[],
  category: string,
  requestedLocation: string,
): FacilityRecommendation[]
