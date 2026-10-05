import * as THREE from 'three'
import { easeOutElastic } from '../ease.js'
import type { AnimContext } from '../types.js'

const at = new THREE.Vector3()

/** Snaps solid, throws one clean hoop, settles. */
export function podReady(uid: string, ctx: AnimContext): void {
  ctx.queue.clearCondition(`pulling:${uid}`)
  const field = ctx.fieldFor(uid)
  if (field === null) return

  field.releaseColor(uid)
  const base = field.baseColorOf(uid)

  if (field.rigPositionOf(uid, at)) {
    ctx.effects.pulseRing(at, base?.getHex() ?? 0xf2efe9, 0.4)
  }

  ctx.queue.add({
    duration: 0.9,
    onUpdate: (p) => field.setScale(uid, 0.5 + easeOutElastic(p) * 0.5),
    onDone: () => field.setScale(uid, 1),
  })
}
