import type { FrameContext } from './world.js'

/** Quiet time before the world starts drifting again. */
const IDLE_MS = 2500
/** How gently motion accelerates back in, so it never grabs the camera. */
const SPINUP = 0.02

/**
 * One gate for every automatic motion in the scene: the camera sway, the
 * rig's spin, the ring's orbit, the precession of the pod shells.
 *
 * Touch the camera and the whole world stops drifting together; let go and
 * it all winds back up together. A cluster also has a gate of its own, held
 * while the pointer is over it, so what is under the pointer stays there to
 * be clicked while the rest of the fleet goes on. Keeping this in a single place is the
 * point, because a camera that stops while the ring keeps turning still
 * reads as the scene moving under you.
 *
 * Asymmetric on purpose: instant stop, gradual start. Easing the stop as
 * well leaves the world sliding under the pointer for about a second,
 * which feels like fighting it.
 */
/** What a moving part reads: 0 holds it still, 1 lets it drift at full rate. */
export interface MotionGate {
  readonly level: number
}

export class Ambient implements MotionGate {
  #lastInput = -Infinity
  #held = false
  #hovered = false
  #level = 0

  /** 0 while the user is driving, easing to 1 once they leave it alone. */
  get level(): number {
    return this.#level
  }

  /** Any camera input at all: drag, wheel, pan. */
  note(): void {
    this.#lastInput = performance.now()
    this.#level = 0
  }

  /** A pointer being held down counts as driving even if it never moves. */
  setHeld(held: boolean): void {
    this.#held = held
    this.#lastInput = performance.now()
  }

  /** The pointer is over what this gate moves, so the user may be about to click it. */
  setHovered(hovered: boolean): void {
    this.#hovered = hovered
    this.#lastInput = performance.now()
  }

  update(ctx: FrameContext): void {
    const idle = !this.#held && !this.#hovered && performance.now() - this.#lastInput > IDLE_MS
    this.#level = idle ? this.#level + (1 - this.#level) * ctx.ease(SPINUP) : 0
  }
}
