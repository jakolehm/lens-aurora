/** Clear air between neighbouring clouds on a ring. */
export const GAP = 0.45
/** chords are shorter than the arcs they are laid out on, so give a little more */
const CHORD_SLACK = 1.1

export interface Placed {
  key: string
  reach: number
}

/**
 * Lays sized things on a circle so that neighbours never touch: each gets an
 * arc as wide as itself, and the circle is as large as all the arcs together.
 */
export function layOnCircle(items: readonly Placed[], minimum: number): { radius: number; angles: Map<string, number> } {
  const widths = items.map((item) => 2 * item.reach + GAP)
  const perimeter = widths.reduce((sum, w) => sum + w, 0)
  const radius = items.length === 0 ? 0 : Math.max(minimum, (perimeter * CHORD_SLACK) / (Math.PI * 2))
  const angles = new Map<string, number>()
  let along = 0
  items.forEach((item, i) => {
    angles.set(item.key, ((along + widths[i]! / 2) / Math.max(perimeter, 1e-6)) * Math.PI * 2)
    along += widths[i]!
  })
  return { radius, angles }
}
