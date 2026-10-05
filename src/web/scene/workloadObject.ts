import * as THREE from 'three'
import type { WorkloadView } from '../../shared/workloads.js'
import { MUTED, workloadHue } from '../theme.js'

/** A workload on its namespace's circle: its pods orbit it the way they orbit a node. */
export class WorkloadObject {
  readonly object = new THREE.Group()
  readonly #glyph: THREE.Mesh
  readonly #hue: THREE.Color
  readonly #short = new THREE.Color(MUTED)
  /** eased share of ready pods */
  #ready = 1

  constructor(parent: THREE.Object3D, workload: WorkloadView) {
    this.#hue = new THREE.Color(workloadHue(workload.kind))
    this.#glyph = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: this.#hue, wireframe: true }),
    )
    this.#glyph.userData['pick'] = { kind: 'workload', key: workload.key }
    this.object.add(this.#glyph)
    parent.add(this.object)
  }

  /** A workload short of ready pods fades toward grey, so it stands out from the healthy ones. */
  update(dt: number, ease: number, ready: number): void {
    this.#ready += (ready - this.#ready) * ease
    this.#glyph.rotation.y += dt * 0.5
    ;(this.#glyph.material as THREE.MeshBasicMaterial).color.copy(this.#short).lerp(this.#hue, this.#ready)
  }

  dispose(): void {
    this.object.removeFromParent()
    this.#glyph.geometry.dispose()
    ;(this.#glyph.material as THREE.Material).dispose()
  }
}
