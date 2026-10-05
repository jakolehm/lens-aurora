import * as THREE from 'three'

const CIRCLE_POINTS = 64

/** A namespace on the workloads ring: a small solid centre, and a faint circle around its workloads. */
export class NamespaceObject {
  readonly object = new THREE.Group()
  readonly #core: THREE.Mesh
  readonly #circle: THREE.LineLoop

  constructor(parent: THREE.Object3D, readonly name: string, color: number) {
    this.#core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color }))
    this.#core.userData['pick'] = { kind: 'namespace', name }

    const points = Array.from({ length: CIRCLE_POINTS }, (_, i) => {
      const a = (i / CIRCLE_POINTS) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a), Math.sin(a), 0)
    })
    this.#circle = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
    )

    this.object.add(this.#core, this.#circle)
    parent.add(this.object)
  }

  update(dt: number, reach: number, dim: number): void {
    this.#core.rotation.y += dt * 0.4
    this.#circle.scale.setScalar(Math.max(reach, 0.001))
    ;(this.#circle.material as THREE.LineBasicMaterial).opacity = 0.35 * (1 - dim)
  }

  dispose(): void {
    this.object.removeFromParent()
    this.object.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line)) return
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    })
  }
}
