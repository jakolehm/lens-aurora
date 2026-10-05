import * as THREE from 'three'
import { RED } from '../../../theme.js'
import { easeInCubic, easeOutCubic } from '../ease.js'
import type { AnimContext } from '../types.js'

const here = new THREE.Vector3()
const there = new THREE.Vector3()
const push = new THREE.Vector3()
const BLAST_RADIUS = 1.2

/** Implodes, then a shockwave that physically shoves the neighbours. */
export function podOomkilled(uid: string, ctx: AnimContext): void {
  const field = ctx.fieldFor(uid)
  if (field === null) return
  const red = new THREE.Color(RED)
  const base = field.baseColorOf(uid)?.clone() ?? red.clone()

  ctx.queue.add({
    duration: 0.22,
    onUpdate: (p) => {
      field.setScale(uid, 1 - easeInCubic(p) * 0.95)
      field.setColor(uid, base.clone().lerp(red, p))
    },
    onDone: () => {
      if (!field.rigPositionOf(uid, here)) return
      ctx.effects.pulseRing(here, RED, 0.85, 0.9)

      for (const other of field.uids()) {
        if (other === uid) continue
        if (!field.rigPositionOf(other, there)) continue
        push.subVectors(there, here)
        const d = push.length()
        if (d < 1e-4 || d > BLAST_RADIUS) continue
        field.nudge(other, push.normalize().multiplyScalar(0.18 * (1 - d / BLAST_RADIUS)))
      }
    },
  })

  ctx.queue.add({
    duration: 0.8,
    delay: 0.22,
    onUpdate: (p) => {
      field.setScale(uid, 0.05 + easeOutCubic(p) * 0.95)
      field.setColor(uid, red.clone().lerp(base, p))
    },
    onDone: () => {
      field.setScale(uid, 1)
      field.releaseColor(uid)
    },
  })
}
