import * as THREE from 'three'

/** The fleet lies flat on this plane, facing the camera at rest. */
export const FLEET_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
