import type { FrameContext } from '../world.js'

export interface Tween {
  /** seconds */
  duration: number
  /** seconds to wait before the first update */
  delay?: number
  onUpdate(progress: number): void
  onDone?(): void
}

interface Running extends Tween {
  elapsed: number
  finished: boolean
}

interface Condition {
  elapsed: number
  fn: (t: number) => void
}

/**
 * One-shot tweens and persistent conditions.
 *
 * A tween runs once and finishes. A condition runs every frame under a key
 * until cleared, which is how crashloop and pressure persist while true.
 */
export class AnimQueue {
  #tweens: Running[] = []
  readonly #conditions = new Map<string, Condition>()

  get size(): number {
    return this.#tweens.length
  }

  add(tween: Tween): void {
    this.#tweens.push({ ...tween, elapsed: 0, finished: false })
  }

  /**
   * Spread a burst so it reads as a wave rather than one frame of chaos.
   * The gap shrinks if the burst would otherwise outlast the cap.
   */
  addStaggered(tweens: Tween[], gapMs: number, capMs: number): void {
    if (tweens.length === 0) return
    const spread = Math.min(gapMs * (tweens.length - 1), capMs)
    const gap = tweens.length > 1 ? spread / (tweens.length - 1) : 0
    for (const [i, tween] of tweens.entries()) {
      this.add({ ...tween, delay: (tween.delay ?? 0) + (gap * i) / 1000 })
    }
  }

  condition(key: string, fn: (t: number) => void): void {
    this.#conditions.set(key, { elapsed: 0, fn })
  }

  clearCondition(key: string): void {
    this.#conditions.delete(key)
  }

  hasCondition(key: string): boolean {
    return this.#conditions.has(key)
  }

  update(ctx: FrameContext): void {
    let anyFinished = false

    for (const t of this.#tweens) {
      t.elapsed += ctx.dt
      const active = t.elapsed - (t.delay ?? 0)
      if (active < 0) continue

      const progress = t.duration <= 0 ? 1 : Math.min(active / t.duration, 1)
      t.onUpdate(progress)
      if (progress >= 1) {
        t.finished = true
        anyFinished = true
        t.onDone?.()
      }
    }

    if (anyFinished) this.#tweens = this.#tweens.filter((t) => !t.finished)

    for (const c of this.#conditions.values()) {
      c.elapsed += ctx.dt
      c.fn(c.elapsed)
    }
  }
}
