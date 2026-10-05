import * as THREE from 'three'
import { FLEET_PLANE } from './fleetPlane.js'
import type { World } from './world.js'

/** What the tracker needs from a cluster: where it is, how far it reaches, and how to hold it. */
export interface Hoverable {
  readonly anchor: THREE.Object3D
  radius(): number
  setHovered(hovered: boolean): void
}

/** Tells a cluster when the pointer is over it, so it can hold still to be clicked. */
export class HoverTracker {
  readonly #world: World
  readonly #clusters: () => Iterable<Hoverable>
  readonly #raycaster = new THREE.Raycaster()
  readonly #pointer = new THREE.Vector2()
  readonly #hit = new THREE.Vector3()
  readonly #centre = new THREE.Vector3()
  #hovered: Hoverable | null = null

  constructor(world: World, clusters: () => Iterable<Hoverable>) {
    this.#world = world
    this.#clusters = clusters
  }

  attach(dom: HTMLElement): void {
    dom.addEventListener('pointermove', (e) => this.#hover(this.#clusterAt(dom, e.clientX, e.clientY)))
    dom.addEventListener('pointerleave', () => this.#hover(null))
  }

  /** The cluster under the pointer is the one around where the ray meets the fleet plane. */
  #clusterAt(dom: HTMLElement, clientX: number, clientY: number): Hoverable | null {
    const { left, top, width, height } = dom.getBoundingClientRect()
    this.#pointer.set(((clientX - left) / width) * 2 - 1, -((clientY - top) / height) * 2 + 1)
    this.#raycaster.setFromCamera(this.#pointer, this.#world.camera)
    if (this.#raycaster.ray.intersectPlane(FLEET_PLANE, this.#hit) === null) return null

    for (const cluster of this.#clusters()) {
      cluster.anchor.getWorldPosition(this.#centre)
      if (this.#centre.distanceTo(this.#hit) <= cluster.radius()) return cluster
    }
    return null
  }

  #hover(cluster: Hoverable | null): void {
    if (cluster === this.#hovered) return
    this.#hovered?.setHovered(false)
    cluster?.setHovered(true)
    this.#hovered = cluster
  }
}
