import * as THREE from 'three'
import type { PodField } from './podField.js'
import type { World } from './world.js'

export type Picked =
  | { kind: 'core'; name: string }
  | { kind: 'node'; name: string }
  | { kind: 'pod'; uid: string }
  | { kind: 'namespace'; name: string }
  | { kind: 'workload'; key: string }
  | { kind: 'entry'; key: string }
  | { kind: 'service'; key: string }

/** What was clicked, and in which cluster: names and uids are only unique within one. */
export interface Pick {
  cluster: string
  target: Picked
}

/** The userData key a cluster's root group carries its id under. */
export const CLUSTER_TAG = 'cluster'

/** Movement beyond this many pixels is a camera drag, not a selection. */
const DRAG_SLOP = 5
/** Fingers are imprecise and wobble on contact, so they get more room. */
const TOUCH_SLOP = 14

export class Picker {
  readonly #world: World
  readonly #onPick: (pick: Pick | null) => void
  readonly #raycaster = new THREE.Raycaster()
  readonly #pointer = new THREE.Vector2()
  #downX = 0
  #downY = 0
  /** how many pointers were down at once during this gesture */
  #maxPointers = 0
  #active = 0
  #dom: HTMLElement | null = null

  constructor(world: World, onPick: (pick: Pick | null) => void) {
    this.#world = world
    this.#onPick = onPick
  }

  attach(dom: HTMLElement): void {
    this.#dom = dom
    dom.addEventListener('pointerdown', (e) => {
      this.#active++
      this.#maxPointers = Math.max(this.#maxPointers, this.#active)
      if (this.#active > 1) return
      this.#downX = e.clientX
      this.#downY = e.clientY
    })

    const end = (e: PointerEvent): void => {
      this.#active = Math.max(0, this.#active - 1)
      const multi = this.#maxPointers > 1
      if (this.#active === 0) this.#maxPointers = 0
      // a pinch is never a tap, however still the fingers ended up
      if (multi) return

      const slop = e.pointerType === 'touch' ? TOUCH_SLOP : DRAG_SLOP
      if (Math.hypot(e.clientX - this.#downX, e.clientY - this.#downY) > slop) return
      this.#onPick(this.#pick(e.clientX, e.clientY))
    }
    dom.addEventListener('pointerup', end)
    dom.addEventListener('pointercancel', (e) => {
      this.#active = Math.max(0, this.#active - 1)
      if (this.#active === 0) this.#maxPointers = 0
      void e
    })

    // scoped to the canvas: Lens is shared with other views that use the keyboard
    dom.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.#onPick(null)
    })
  }

  #pick(clientX: number, clientY: number): Pick | null {
    const r = this.#dom?.getBoundingClientRect()
    if (r === undefined) return null
    const { left, top, width, height } = r
    this.#pointer.set(((clientX - left) / width) * 2 - 1, -((clientY - top) / height) * 2 + 1)
    this.#raycaster.setFromCamera(this.#pointer, this.#world.camera)

    // links are Lines, whose default raycast threshold is a full world unit
    this.#raycaster.params.Line.threshold = 0

    // Pods beat the node they orbit, whatever the depth order says. A node's
    // body is nearly transparent, so you can see the far half of its shell
    // through it and expect to click those pods; taking the nearest hit
    // instead hands you the node every time. Nodes stay easy to hit because
    // the shell is hollow and their body sits in the gap.
    let node: Pick | null = null

    for (const hit of this.#raycaster.intersectObject(this.#world.rig, true)) {
      // the lens that is off still has its objects, only hidden
      if (!isShown(hit.object)) continue
      const field = hit.object.userData['podField'] as PodField | undefined
      if (field !== undefined) {
        if (hit.instanceId === undefined) continue
        const uid = uidForSlot(field, hit.instanceId)
        const cluster = clusterOf(hit.object)
        if (uid !== null && cluster !== null) return { cluster, target: { kind: 'pod', uid } }
        continue
      }

      if (node !== null) continue
      // walk up to whichever ancestor carries the pick tag
      let o: THREE.Object3D | null = hit.object
      while (o !== null) {
        const tag = o.userData['pick'] as Picked | undefined
        if (tag !== undefined) {
          const cluster = clusterOf(o)
          if (cluster !== null) node = { cluster, target: tag }
          break
        }
        o = o.parent
      }
    }
    return node
  }
}

function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o !== null; o = o.parent) if (!o.visible) return false
  return true
}

function clusterOf(object: THREE.Object3D): string | null {
  for (let o: THREE.Object3D | null = object; o !== null; o = o.parent) {
    const id = o.userData[CLUSTER_TAG] as string | undefined
    if (id !== undefined) return id
  }
  return null
}

function uidForSlot(field: PodField, slot: number): string | null {
  for (const uid of field.uids()) {
    if (field.slotOf(uid) === slot) return uid
  }
  return null
}
