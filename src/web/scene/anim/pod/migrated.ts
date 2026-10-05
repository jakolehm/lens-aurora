import * as THREE from 'three'
import { easeOutBack } from '../ease.js'
import type { AnimContext } from '../types.js'

const from = new THREE.Vector3()
const to = new THREE.Vector3()

/** A ghost arcs across the ring; the cube reforms where it lands. */
export function podMigrated(uid: string, fromNode: string, toNode: string, ctx: AnimContext): void {
  const field = ctx.fieldFor(uid)
  if (field === null) return

  field.setScale(uid, 0.001)
  const bloom = (): void => {
    ctx.queue.add({
      duration: 0.6,
      onUpdate: (p) => field.setScale(uid, easeOutBack(p)),
      onDone: () => field.setScale(uid, 1),
    })
  }

  const a = ctx.nodePosition(fromNode)
  const b = ctx.nodePosition(toNode)
  if (a === null || b === null) {
    bloom()
    return
  }

  from.copy(a)
  to.copy(b)
  ctx.effects.ghostTrail(from, to, field.baseColorOf(uid)?.getHex() ?? 0xf2efe9, bloom)
}
