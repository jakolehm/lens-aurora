import * as THREE from 'three'
import { RED } from '../../../theme.js'
import { arrhythmic } from '../ease.js'
import type { AnimContext } from '../types.js'

const RED_C = new THREE.Color(RED)
const wobble = new THREE.Vector3()

/** Persistent, arrhythmic, visibly sick. Runs until the condition clears. */
export function podCrashloop(uid: string, ctx: AnimContext): void {
  const field = ctx.fieldFor(uid)
  if (field === null) return
  const base = field.baseColorOf(uid)?.clone() ?? RED_C.clone()

  ctx.queue.condition(`crash:${uid}`, (t) => {
    const strobe = arrhythmic(t)
    // amplitude decays as the real backoff lengthens
    const decay = 1 / (1 + t * 0.12)
    field.setScale(uid, 0.8 + strobe * 0.5 * decay)
    field.setColor(uid, base.clone().lerp(RED_C, 0.4 + strobe * 0.6))
    wobble
      .set(Math.sin(t * 9.1), Math.cos(t * 7.3), Math.sin(t * 5.7))
      .multiplyScalar(0.004 * decay)
    field.nudge(uid, wobble)
  })
}

export function podCrashloopCleared(uid: string, ctx: AnimContext): void {
  ctx.queue.clearCondition(`crash:${uid}`)
  const field = ctx.fieldFor(uid)
  if (field === null) return
  field.releaseColor(uid)
  field.setScale(uid, 1)
}
