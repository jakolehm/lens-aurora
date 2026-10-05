import { easeOutBack } from '../ease.js'
import type { AnimContext } from '../types.js'

/** A mote leaves the core, runs the link, and blooms into a cube. */
export function podScheduled(uid: string, node: string, ctx: AnimContext): void {
  ctx.core.pulse()
  ctx.ring.links.dispatch(node)

  const field = ctx.fieldFor(uid)
  if (field === null) return

  field.setScale(uid, 0.001)
  ctx.queue.add({
    duration: 0.75,
    delay: 0.35, // let the mote reach the node first
    onUpdate: (p) => field.setScale(uid, easeOutBack(p)),
    onDone: () => field.setScale(uid, 1),
  })
}
