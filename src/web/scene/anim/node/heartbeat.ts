import type { AnimContext } from '../types.js'

/**
 * A kubelet renewing its lease, roughly every ten seconds. One mote leaves
 * the node for the core and the node's edges brighten a touch as it goes.
 *
 * This is the only thing riding the links at rest, which is the point: a
 * node whose kubelet has died stops sending them immediately, so its link
 * falls silent well before the Ready condition flips and the node greys
 * out. The silence is the first warning.
 */
export function nodeHeartbeat(name: string, ctx: AnimContext): void {
  const node = ctx.ring.nodes.get(name)
  if (node !== undefined) {
    ctx.ring.links.heartbeat(name)
    node.flash = Math.max(node.flash, 0.22)
    return
  }
  // the control plane has a kubelet too, but it is the core rather than a
  // ring slot, so it has no link to send a mote down: it beats in place
  if (ctx.state.nodes.get(name)?.role === 'control-plane') ctx.core.pulseNode(name, 0.16)
}
