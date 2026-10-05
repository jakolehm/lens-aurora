import * as THREE from 'three'
import type { RelatedKind, RelatedView, WorkloadView } from '../../shared/workloads.js'
import { LINK_GRAY, RELATED_HUES } from '../theme.js'
import { Segments } from './segments.js'
import type { Tag } from './tag.js'
import type { FrameContext } from './world.js'

/** Past the pod cloud, so a related resource is never mistaken for a pod. */
const CLEARANCE = 0.35
const ORBIT_RATE = 0.08
const GLYPH_SPIN = 0.6

/** A shape per kind, so a glance tells a volume from a service before any label is read. */
const GLYPHS: Record<RelatedKind, () => THREE.BufferGeometry> = {
  Ingress: () => new THREE.ConeGeometry(0.09, 0.18, 4),
  Service: () => new THREE.TorusGeometry(0.09, 0.022, 8, 24),
  PersistentVolumeClaim: () => new THREE.CylinderGeometry(0.075, 0.075, 0.15, 16),
  ConfigMap: () => new THREE.BoxGeometry(0.17, 0.12, 0.025),
  Secret: () => new THREE.OctahedronGeometry(0.1),
  ServiceAccount: () => new THREE.SphereGeometry(0.065, 12, 8),
}

const SHORT: Record<RelatedKind, string> = {
  Ingress: 'ing',
  Service: 'svc',
  PersistentVolumeClaim: 'pvc',
  ConfigMap: 'cm',
  Secret: 'secret',
  ServiceAccount: 'sa',
}

interface Satellite {
  related: RelatedView
  mesh: THREE.Mesh
}

const signature = (w: WorkloadView): string => [w.key, ...w.related.map((r) => `${r.kind}/${r.name}`)].join('|')

/**
 * What the selected workload depends on, circling it just outside its pods.
 * Hangs on the workload itself, so it moves wherever the workload goes.
 */
export class WorkloadOverlay {
  readonly #group = new THREE.Group()
  readonly #ties = new Segments(LINK_GRAY, 0.85)
  readonly #centre = new THREE.Vector3()
  #satellites: Satellite[] = []
  #signature = ''
  #orbit = 0
  #radius = 0

  constructor() {
    this.#group.add(this.#ties.lines)
  }

  /** How far the circle of related resources reaches past a pod cloud of this size. */
  static reach(podReach: number): number {
    return podReach + CLEARANCE
  }

  show(workload: WorkloadView | null, host: THREE.Object3D | null, podReach: number): void {
    if (workload === null || host === null) {
      this.#group.removeFromParent()
      if (this.#signature !== '') this.#rebuild(null)
      return
    }
    if (this.#group.parent !== host) host.add(this.#group)
    this.#radius = WorkloadOverlay.reach(podReach)
    const next = signature(workload)
    if (next !== this.#signature) this.#rebuild(workload)
  }

  update(ctx: FrameContext): void {
    if (this.#group.parent === null) return
    this.#orbit += ctx.dt * ORBIT_RATE

    const services = new Map<string, THREE.Vector3>()
    this.#satellites.forEach(({ related, mesh }, i) => {
      const angle = this.#orbit + (i / this.#satellites.length) * Math.PI * 2
      mesh.position.set(Math.cos(angle) * this.#radius, Math.sin(angle) * this.#radius, 0)
      mesh.rotation.y += ctx.dt * GLYPH_SPIN
      if (related.kind === 'Service') services.set(related.name, mesh.position)
    })
    // an ingress reaches the workload through its service, and the line says so
    this.#ties.draw(
      this.#satellites.map(({ related, mesh }) => {
        const to = related.via === null ? undefined : services.get(related.via)
        return [mesh.position, to ?? this.#centre] as const
      }),
    )
  }

  tags(): Tag[] {
    if (this.#group.parent === null) return []
    return this.#satellites.map(({ related, mesh }) => ({
      text: `${SHORT[related.kind]} ${related.name}`,
      at: mesh.getWorldPosition(new THREE.Vector3()),
      place: 'beside' as const,
    }))
  }

  #rebuild(workload: WorkloadView | null): void {
    for (const { mesh } of this.#satellites) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.#signature = workload === null ? '' : signature(workload)
    this.#satellites = (workload?.related ?? []).map((related) => {
      const mesh = new THREE.Mesh(GLYPHS[related.kind](), new THREE.MeshBasicMaterial({ color: RELATED_HUES[related.kind] }))
      this.#group.add(mesh)
      return { related, mesh }
    })
  }
}
