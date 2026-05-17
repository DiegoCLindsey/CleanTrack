/**
 * Computes normalized weight (0–1) per room name.
 *
 * Rules:
 *  - estimate + zones exist  → proportional to total zone area for that room
 *  - estimate + no zones     → equal share (1/N)
 *  - fixed + value > 0       → use that value, then normalize
 *  - fixed + no value        → treated as 1 (equal share)
 */
export function computeWeights(roomNames, roomWeights, zones) {
  const raw = {}

  for (const name of roomNames) {
    const s = roomWeights?.[name]
    const mode = s?.mode ?? 'estimate'

    if (mode === 'fixed') {
      const v = s?.value
      raw[name] = v !== null && v !== undefined && Number(v) > 0 ? Number(v) : 1
    } else {
      // estimate: sum area of all zones assigned to this room
      raw[name] = (zones ?? [])
        .filter(z => z.roomName === name)
        .reduce((sum, z) => sum + z.w * z.h, 0)
    }
  }

  const total = Object.values(raw).reduce((s, v) => s + v, 0)

  if (total === 0) {
    const eq = 1 / roomNames.length
    return Object.fromEntries(roomNames.map(n => [n, eq]))
  }

  return Object.fromEntries(roomNames.map(n => [n, raw[n] / total]))
}

/**
 * Returns weighted pct + raw done/total for a session.
 */
export function calcWeightedProgress(session, weights) {
  const rooms = session?.rooms ?? []
  let rawDone = 0, rawTotal = 0
  let wDone = 0, wTotal = 0

  for (const room of rooms) {
    const steps = room.steps ?? []
    const d = steps.filter(s => s.done).length
    const t = steps.length
    rawDone += d
    rawTotal += t

    const w = weights?.[room.name] ?? 1 / rooms.length
    if (t > 0) {
      wDone += w * (d / t)
      wTotal += w
    }
  }

  const pct = wTotal === 0 ? 0 : Math.round((wDone / wTotal) * 100)
  return { done: rawDone, total: rawTotal, pct }
}
