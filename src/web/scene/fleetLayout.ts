/** Empty space between neighbouring clusters, in world units. */
const GAP = 1.2

export interface Placement {
  x: number
  y: number
}

/**
 * Lays clusters out on a near-square grid, centred on the origin. Every cell
 * is as wide as the widest cluster, so a growing cluster never overlaps a
 * neighbour; the grid simply spreads.
 */
export function layoutFleet(radii: readonly number[]): Placement[] {
  if (radii.length === 0) return []

  const columns = Math.ceil(Math.sqrt(radii.length))
  const rows = Math.ceil(radii.length / columns)
  const cell = 2 * Math.max(...radii) + GAP

  return radii.map((_, i) => {
    const column = i % columns
    const row = Math.floor(i / columns)
    // a short last row is centred under the full ones
    const inRow = row === rows - 1 ? radii.length - row * columns : columns
    return {
      x: (column - (inRow - 1) / 2) * cell,
      y: ((rows - 1) / 2 - row) * cell,
    }
  })
}

/** How far the fleet reaches from the origin, for framing the camera. */
export function fleetRadius(placements: readonly Placement[], radii: readonly number[]): number {
  return placements.reduce((widest, p, i) => Math.max(widest, Math.hypot(p.x, p.y) + radii[i]!), 0)
}
