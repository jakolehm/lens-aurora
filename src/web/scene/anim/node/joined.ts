import { easeOutBack } from '../ease.js'
import type { AnimContext } from '../types.js'

/** The prism unfolds as it locks into its slot. */
export function nodeJoined(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return

  ctx.core.pulse()
  node.flash = 1.2

  ctx.queue.add({
    duration: 1.1,
    onUpdate: (p) => {
      node.object.rotation.y = (1 - easeOutBack(p)) * Math.PI * 2
    },
    onDone: () => {
      node.object.rotation.y = 0
    },
  })
}
