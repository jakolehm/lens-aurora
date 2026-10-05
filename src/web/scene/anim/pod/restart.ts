import * as THREE from 'three'
import { easeOutBack } from '../ease.js'
import type { AnimContext } from '../types.js'

const WHITE = new THREE.Color(0xffffff)

/** Collapses to a point, re-inflates white-hot. */
export function podRestart(uid: string, ctx: AnimContext): void {
  const field = ctx.fieldFor(uid)
  if (field === null) return
  const base = field.baseColorOf(uid)?.clone() ?? WHITE.clone()

  ctx.queue.add({
    duration: 0.28,
    onUpdate: (p) => field.setScale(uid, 1 - p * 0.98),
  })
  ctx.queue.add({
    duration: 0.55,
    delay: 0.28,
    onUpdate: (p) => {
      field.setScale(uid, 0.02 + easeOutBack(p) * 0.98)
      field.setColor(uid, WHITE.clone().lerp(base, p))
    },
    onDone: () => {
      field.setScale(uid, 1)
      field.releaseColor(uid)
    },
  })
}
