import * as THREE from 'three'
import type { NodeView } from '../../shared/protocol.js'
import { IVORY, MUTED, RED } from '../theme.js'
import type { FrameContext } from './world.js'

export interface CoreLoad {
  /** 0..1 share of allocatable CPU */
  cpu: number
  /** 0..1 share of allocatable memory */
  memory: number
}

const AMBER = 0xffb020

/** How far a core's body reaches from its centre: the cordon ring, its widest part. */
export const CORE_BODY_REACH = 0.8

/** The control-plane node: the ivory octahedron everything orbits. */
export class CoreObject {
  readonly object = new THREE.Group()
  readonly shell: THREE.Mesh
  readonly inner: THREE.Mesh

  readonly #shellMat: THREE.MeshBasicMaterial
  readonly #innerMat: THREE.MeshBasicMaterial
  readonly #cordon: THREE.LineSegments
  readonly #live = new THREE.Color(IVORY)
  readonly #dead = new THREE.Color(MUTED)
  readonly #stress = new THREE.Color(AMBER)
  readonly #scratch = new THREE.Color()

  #view: NodeView | null = null
  #focus = 0
  /** eased swell, and the target it is easing toward */
  #pulse = 0
  #pulseTarget = 0
  #spin = 0
  /** eased CPU and memory shares, 0..1 */
  #cpu = 0
  #level = 0
  /** eased condition amounts, matching NodeObject */
  #sag = 0
  #stressed = 0

  constructor(rig: THREE.Group, readonly name = '') {
    this.#shellMat = new THREE.MeshBasicMaterial({ color: IVORY, wireframe: true })
    this.shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.#shellMat)

    this.#innerMat = new THREE.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0.3 })
    this.inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.#innerMat)

    // the control plane can be cordoned like any other node
    this.#cordon = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.78, 0.006, 3, 24)),
      // an invisible ring must not write depth, or it cuts a hole through the pods behind it
      new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false }),
    )

    this.object.add(this.shell, this.inner, this.#cordon)
    this.object.userData['pick'] = { kind: 'core', name }
    rig.add(this.object)
  }

  /** The control plane's own NodeView, so it can show its condition. */
  setView(view: NodeView | null): void {
    this.#view = view
  }

  setFocus(amount: number): void {
    this.#focus = amount
  }

  /**
   * A soft outward swell. Eased in as well as out: snapping the target
   * straight into the live value made every heartbeat pop the core's scale,
   * which read as a stutter rather than a beat.
   */
  pulse(strength = 1): void {
    this.#pulseTarget = Math.max(this.#pulseTarget, strength)
  }

  /**
   * The control plane speaks the same language as the workers: the shell
   * turns faster with CPU, the solid inner octahedron swells as memory fills,
   * and it greys, warms and grows a containment ring on the same conditions.
   */
  update(ctx: FrameContext, boot: number, load: CoreLoad = { cpu: 0, memory: 0 }): void {
    this.#pulse += (this.#pulseTarget - this.#pulse) * ctx.ease(0.22)
    this.#pulseTarget *= 1 - ctx.ease(0.06)

    this.#cpu += (load.cpu - this.#cpu) * ctx.ease(0.03)
    this.#level += (load.memory - this.#level) * ctx.ease(0.03)

    const v = this.#view
    this.#sag += ((v !== null && !v.ready ? 1 : 0) - this.#sag) * ctx.ease(0.05)
    this.#stressed += ((v !== null && v.pressure.length > 0 ? 1 : 0) - this.#stressed) * ctx.ease(0.05)

    // integrated, so a change in CPU never snaps the rotation
    this.#spin += ctx.dt * (0.4 + this.#cpu * 1.1) * (1 - this.#sag * 0.8)

    const scale = boot * (1 + this.#focus * 0.45 + this.#pulse * 0.3)
    this.shell.rotation.y = this.#spin
    this.shell.rotation.x = this.#spin * 0.58
    this.shell.scale.setScalar(Math.max(scale, 0.001))

    const breath = 1 + Math.sin(ctx.t * (0.5 + this.#cpu * 1.6) * Math.PI * 2) * 0.05
    const fill = 0.42 + this.#level * 0.78
    this.inner.rotation.y = -this.#spin * 1.35
    this.inner.scale.setScalar(Math.max(breath * fill * boot * (1 + this.#focus * 0.6), 0.001))

    // ivory when healthy, amber under pressure, grey when NotReady
    const color = this.#scratch.copy(this.#live)
    color.lerp(this.#stress, this.#stressed * 0.75)
    color.lerp(this.#dead, this.#sag)
    this.#shellMat.color.copy(color)
    this.#innerMat.color.copy(color)
    this.#innerMat.opacity = (0.18 + this.#level * 0.34) * (1 - this.#sag * 0.5)

    const cordonMat = this.#cordon.material as THREE.LineBasicMaterial
    const wanted = v !== null && !v.schedulable ? 0.65 : 0
    cordonMat.opacity += (wanted - cordonMat.opacity) * ctx.ease(0.04)
    this.#cordon.visible = cordonMat.opacity > 0.01
    this.#cordon.rotation.z = ctx.t * 0.6
  }
}
