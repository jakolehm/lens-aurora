import type * as THREE from 'three'
import type { ClusterState } from '../../state/cluster.js'
import type { CorePlane } from '../corePlane.js'
import type { PodField } from '../podField.js'
import type { Ring } from '../ring.js'
import type { Effects } from './effects.js'
import type { AnimQueue } from './queue.js'

export interface AnimContext {
  queue: AnimQueue
  ring: Ring
  core: CorePlane
  state: ClusterState
  effects: Effects
  /** the pod field that owns this uid, wherever it currently lives */
  fieldFor(uid: string): PodField | null
  /** rig-local position of a node, or of the core for the control plane */
  nodePosition(name: string): THREE.Vector3 | null
}
