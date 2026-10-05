import type { AnimContext } from '../types.js'

/** Small and breathing while the image comes down. */
export function podPulling(uid: string, ctx: AnimContext): void {
  const field = ctx.fieldFor(uid)
  if (field === null) return
  ctx.queue.condition(`pulling:${uid}`, (t) => {
    field.setScale(uid, 0.45 + Math.sin(t * 5) * 0.12)
  })
}
