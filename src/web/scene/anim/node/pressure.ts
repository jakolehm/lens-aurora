import type { AnimContext } from '../types.js'

/**
 * NodeObject already eases the amber tint and the deeper breath from the
 * view; this is the swell that announces it.
 */
export function nodePressure(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return
  ctx.queue.add({
    duration: 0.9,
    onUpdate: (p) => {
      node.flash = Math.sin(p * Math.PI) * 0.5
    },
    onDone: () => {
      node.flash = 0
    },
  })
}

export function nodePressureCleared(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node === undefined) return
  node.flash = 0.3
}
