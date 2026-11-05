import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import collectionData from "../data/collection-locations.json" with { type: "json" }
import coordinateData from "../data/facility-coordinates.json" with { type: "json" }

const databasePath = resolve(process.env.ECOCYCLE_DB_PATH || "data/ecocycle.sqlite")
mkdirSync(dirname(databasePath), { recursive: true })

export const database = new DatabaseSync(databasePath)
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY,
    municipality TEXT NOT NULL,
    name TEXT NOT NULL,
    operator TEXT NOT NULL,
    accepted_devices TEXT NOT NULL,
    status TEXT NOT NULL,
    address TEXT,
    operating_hours_json TEXT NOT NULL DEFAULT '[]',
    latitude REAL,
    longitude REAL,
    coordinate_source TEXT,
    coordinate_venue_name TEXT,
    UNIQUE(municipality, name),
    CHECK ((latitude IS NULL AND longitude IS NULL) OR
           (latitude IS NOT NULL AND longitude IS NOT NULL AND
            latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    user_type TEXT NOT NULL CHECK (user_type IN ('Student', 'Household', 'General User')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS auth_sessions_user_id ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS auth_sessions_expires_at ON auth_sessions(expires_at);
`)

const seedVersion = database.prepare("SELECT version FROM schema_migrations WHERE version = 1").get()
if (!seedVersion) {
  const insertFacility = database.prepare(`
    INSERT INTO facilities (
      municipality, name, operator, accepted_devices, status, address,
      operating_hours_json, latitude, longitude, coordinate_source, coordinate_venue_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  database.exec("BEGIN IMMEDIATE")
  try {
    for (const area of collectionData) {
      for (const facility of area.locations) {
        const coordinates = coordinateData.locations[`${area.municipality}/${facility.name}`]
        insertFacility.run(
          area.municipality,
          facility.name,
          facility.operator,
          facility.acceptedDevices,
          facility.status,
          facility.address ?? null,
          JSON.stringify(facility.operatingHours ?? []),
          coordinates?.latitude ?? null,
          coordinates?.longitude ?? null,
          coordinates?.source ?? null,
          coordinates?.venueName ?? null,
        )
      }
    }
    database.prepare("INSERT INTO schema_migrations (version) VALUES (1)").run()
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

// Keep coordinates current for databases created before the location dataset
// was expanded. The original seed only ran once, which left existing installs
// without newly added map pins and made nearest-facility results incomplete.
const coordinatesVersion = database.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()
if (!coordinatesVersion) {
  const updateCoordinates = database.prepare(`
    UPDATE facilities
    SET latitude = ?, longitude = ?, coordinate_source = ?, coordinate_venue_name = ?
    WHERE municipality = ? AND name = ?
  `)
  database.exec("BEGIN IMMEDIATE")
  try {
    for (const [key, coordinates] of Object.entries(coordinateData.locations)) {
      const separator = key.indexOf("/")
      if (separator < 0) continue
      updateCoordinates.run(
        coordinates.latitude,
        coordinates.longitude,
        coordinates.source ?? null,
        coordinates.venueName ?? null,
        key.slice(0, separator),
        key.slice(separator + 1),
      )
    }
    database.prepare("INSERT INTO schema_migrations (version) VALUES (2)").run()
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

export function getCollectionLocations() {
  const rows = database.prepare(`
    SELECT municipality, name, operator, accepted_devices, status, address,
      operating_hours_json, latitude, longitude, coordinate_source, coordinate_venue_name
    FROM facilities ORDER BY municipality COLLATE NOCASE, name COLLATE NOCASE
  `).all()
  const areas = new Map()
  for (const row of rows) {
    if (!areas.has(row.municipality)) areas.set(row.municipality, { municipality: row.municipality, locations: [] })
    areas.get(row.municipality).locations.push({
      name: row.name,
      operator: row.operator,
      acceptedDevices: row.accepted_devices,
      status: row.status,
      ...(row.address ? { address: row.address } : {}),
      operatingHours: JSON.parse(row.operating_hours_json),
      ...(row.latitude !== null && row.longitude !== null
        ? { coordinates: { latitude: row.latitude, longitude: row.longitude, source: row.coordinate_source, venueName: row.coordinate_venue_name } }
        : {}),
    })
  }
  return [...areas.values()]
}
