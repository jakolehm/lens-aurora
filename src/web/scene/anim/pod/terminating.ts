import * as THREE from 'three'
import { easeInCubic } from '../ease.js'
import type { AnimContext } from '../types.js'

const at = new THREE.Vector3()

/** Dissolves into a spray of motes drifting outward. */
export function podTerminating(uid: string, ctx: AnimContext): void {
  ctx.queue.clearCondition(`crash:${uid}`)
  ctx.queue.clearCondition(`pulling:${uid}`)

  const field = ctx.fieldFor(uid)
  if (field === null) return

  if (field.rigPositionOf(uid, at)) {
    ctx.effects.spray(at, field.baseColorOf(uid)?.getHex() ?? 0x9b948b, 20)
  }
  ctx.queue.add({
    duration: 0.5,
    onUpdate: (p) => field.setScale(uid, 1 - easeInCubic(p)),
  })
}
