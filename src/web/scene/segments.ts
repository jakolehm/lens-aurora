import * as THREE from 'three'

/** Line pairs in one draw call, with a buffer that grows with the number of pairs. */
export class Segments {
  readonly lines: THREE.LineSegments
  #capacity = 0

  constructor(color: number, opacity: number) {
    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    )
    this.lines.frustumCulled = false
  }

  draw(pairs: readonly (readonly [THREE.Vector3, THREE.Vector3])[]): void {
    if (pairs.length > this.#capacity) {
      this.#capacity = Math.max(pairs.length, this.#capacity * 2, 8)
      this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.#capacity * 6), 3))
    }
    const position = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (position === undefined) return
    pairs.forEach(([a, b], i) => {
      position.setXYZ(i * 2, a.x, a.y, a.z)
      position.setXYZ(i * 2 + 1, b.x, b.y, b.z)
    })
    position.needsUpdate = true
    this.lines.geometry.setDrawRange(0, pairs.length * 2)
  }
}
