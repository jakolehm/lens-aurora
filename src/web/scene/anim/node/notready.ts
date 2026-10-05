import type { AnimContext } from '../types.js'

/** One violent stutter, then the link frays and the pods slow to a crawl. */
export function nodeNotReady(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return

  ctx.queue.add({
    duration: 0.85,
    onUpdate: (p) => {
      node.fray = p
      node.flash = p < 0.35 ? Math.sin(p * 40) * 0.5 * (1 - p) : 0
    },
    onDone: () => {
      node.fray = 1
    },
  })

  const field = ctx.ring.podFields.get(name)
  if (field === undefined) return
  ctx.queue.condition(`dim:${name}`, () => {
    for (const uid of field.uids()) field.setScale(uid, 0.7)
  })
}
