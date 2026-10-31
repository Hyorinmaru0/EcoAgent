import type { Coordinates } from "./facilityRecommendations.mjs"

export type UserLocation = Coordinates & { accuracy: number }

export function readBrowserLocation(geolocation?: Pick<Geolocation, "getCurrentPosition">, secureContext?: boolean): Promise<UserLocation>
