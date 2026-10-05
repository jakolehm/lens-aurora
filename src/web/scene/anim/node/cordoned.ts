import type { AnimContext } from '../types.js'

/** The containment ring fades in from the view; this is the beat under it. */
export function nodeCordoned(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return
  ctx.queue.add({
    duration: 0.5,
    onUpdate: (p) => {
      node.flash = (1 - p) * 0.7
    },
    onDone: () => {
      node.flash = 0
    },
  })
}

export function nodeUncordoned(name: string, ctx: AnimContext): void {
  if (!ctx.ring.nodes.has(name)) return
  ctx.core.pulse()
  ctx.ring.links.dispatch(name)
}
