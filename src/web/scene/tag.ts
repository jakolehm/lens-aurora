import type * as THREE from 'three'

/** A name the scene wants shown next to something, in world space. */
export interface Tag {
  text: string
  at: THREE.Vector3
  /** beside the point, for small things; or centred below it, for the name of an area */
  place: 'beside' | 'below'
}
