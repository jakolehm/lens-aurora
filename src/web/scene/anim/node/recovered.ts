import { easeOutCubic } from '../ease.js'
import type { AnimContext } from '../types.js'

/** A surge of light runs outward along the link, re-saturating as it goes. */
export function nodeRecovered(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return

  ctx.queue.clearCondition(`dim:${name}`)
  ctx.core.pulse()

  // three motes chase each other out along the link
  for (let i = 0; i < 3; i++) {
    ctx.queue.add({
      duration: 0,
      delay: i * 0.12,
      onUpdate: () => {},
      onDone: () => ctx.ring.links.dispatch(name),
    })
  }

  ctx.queue.add({
    duration: 1.0,
    onUpdate: (p) => {
      node.fray = 1 - easeOutCubic(p)
      node.flash = (1 - p) * 1.4
    },
    onDone: () => {
      node.fray = 0
      node.flash = 0
    },
  })

  const field = ctx.ring.podFields.get(name)
  if (field === undefined) return
  ctx.queue.add({
    duration: 0.9,
    onUpdate: (p) => {
      for (const uid of field.uids()) field.setScale(uid, 0.7 + p * 0.3)
    },
    onDone: () => {
      for (const uid of field.uids()) field.setScale(uid, 1)
    },
  })
}
