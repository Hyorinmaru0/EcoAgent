import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import collectionData from "../data/collection-locations.json" with { type: "json" }

test("visit details update legacy databases without replacing saved facilities", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ecocycle-facility-visits-"))
  const path = join(directory, "facilities.sqlite")
  process.env.ECOCYCLE_DB_PATH = path
  let { database, getCollectionLocations } = await import("../server/facility-database.mjs?initial-visits")
  t.after(async () => {
    database.close()
    for (const suffix of ["", "-wal", "-shm"]) await rm(path + suffix, { force: true })
    await rmdir(directory)
  })
  const original = database.prepare("SELECT id FROM facilities ORDER BY id LIMIT 1").get()
  database.exec("CREATE TABLE saved_reference (facility_id INTEGER REFERENCES facilities(id))")
  database.prepare("INSERT INTO saved_reference VALUES (?)").run(original.id)
  database.exec("DELETE FROM schema_migrations WHERE version = 3; UPDATE facilities SET address = NULL, operating_hours_json = '[]'")
  database.close()
  ;({ database, getCollectionLocations } = await import("../server/facility-database.mjs?migrated-visits"))
  const records = getCollectionLocations().flatMap((area) => area.locations)
  assert.equal(records.length, 47)
  assert.equal(database.prepare("SELECT facility_id FROM saved_reference").get().facility_id, original.id)
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), [])
  for (const area of collectionData) for (const facility of area.locations) {
    const record = getCollectionLocations().find((a) => a.municipality === area.municipality).locations.find((f) => f.name === facility.name)
    assert.equal(record.address, facility.address)
    assert.deepEqual(record.operatingHours, facility.operatingHours)
    assert.ok(record.visitInfo.note)
    assert.ok(record.visitInfo.sources.every((source) => new URL(source.url).protocol === "https:"))
    assert.ok(record.operatingHours.length || /confirmation|access/i.test(record.visitInfo.hoursKind))
    for (const hours of record.operatingHours) {
      assert.match(hours.opens, /^\d{1,2}(:\d{2})?(am|pm)$/)
      assert.match(hours.closes, /^\d{1,2}(:\d{2})?(am|pm)$/)
    }
  }
  const tes = records.find((f) => f.name === "SK Tes / TES-AMM Philippines")
  assert.deepEqual(tes.operatingHours, [])
  assert.match(tes.visitInfo.note, /not published/i)
})
