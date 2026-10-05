import * as THREE from 'three'
import type { NodeView } from '../../shared/protocol.js'
import { MUTED, RED } from '../theme.js'
import type { FrameContext } from './world.js'

export interface NodeLayout {
  angle: number
  radius: number
  /** 0 = fully lit, 1 = fully dimmed because something else holds focus */
  dim: number
  /** breathing frequency in Hz, driven by CPU load */
  breath: number
  /** 0..1 share of allocatable memory in use */
  memory: number
}

const AMBER = 0xffb020

/** A worker node: a hex prism whose colour and posture carry its condition. */
export class NodeObject {
  readonly object = new THREE.Group()
  readonly hue: number

  /** 0 = still inside the core, 1 = fully joined to the ring */
  join = 0
  /** eased focus amount, 0..1 */
  focus = 0
  /** eased 0..1, how far this node has sagged out of the ring while NotReady */
  sag = 0
  /** eased 0..1, amber pressure glow */
  stress = 0
  /** transient additive brightness, driven by event animations */
  flash = 0
  /** 0..1, how broken this node's link looks right now */
  fray = 0

  readonly #hexMat: THREE.MeshBasicMaterial
  readonly #edgeMat: THREE.LineBasicMaterial
  readonly #cordon: THREE.LineSegments
  readonly #fill: THREE.Mesh
  readonly #fillMat: THREE.MeshBasicMaterial
  /** eased memory fill, 0 at the centre to 1 at the rim */
  #level = 0
  readonly #liveColor: THREE.Color
  readonly #deadColor = new THREE.Color(MUTED)
  readonly #stressColor = new THREE.Color(AMBER)
  readonly #white = new THREE.Color(0xffffff)
  readonly #scratch = new THREE.Color()
  #view: NodeView

  constructor(view: NodeView, hue: number) {
    this.#view = view
    this.hue = hue
    this.#liveColor = new THREE.Color(hue)

    const geometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 6)
    this.#hexMat = new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.16 })
    const hex = new THREE.Mesh(geometry, this.#hexMat)
    hex.rotation.x = Math.PI / 2

    this.#edgeMat = new THREE.LineBasicMaterial({ color: hue, transparent: true, opacity: 1 })
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), this.#edgeMat)
    edges.rotation.x = Math.PI / 2

    // memory as a vessel: an inner hex that reaches for the rim as the node
    // fills. Slightly proud of the shell so it reads through the body.
    this.#fillMat = new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.42 })
    this.#fill = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.24, 6), this.#fillMat)
    this.#fill.rotation.x = Math.PI / 2
    this.#fill.scale.set(0.001, 1, 0.001)

    // the cordon ring: invisible until the node is marked unschedulable
    this.#cordon = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.52, 0.006, 3, 20)),
      // an invisible ring must not write depth, or it cuts a hole through the pods behind it
      new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false }),
    )

    this.object.add(hex, this.#fill, edges, this.#cordon)
    this.object.userData['pick'] = { kind: 'node', name: view.name }
  }

  get view(): NodeView {
    return this.#view
  }

  setView(view: NodeView): void {
    this.#view = view
    this.object.userData['pick'] = { kind: 'node', name: view.name }
  }

  update(ctx: FrameContext, layout: NodeLayout): void {
    const v = this.#view

    this.sag += ((v.ready ? 0 : 1) - this.sag) * ctx.ease(0.05)
    this.stress += ((v.pressure.length > 0 ? 1 : 0) - this.stress) * ctx.ease(0.05)

    const r = layout.radius * this.join
    this.object.position.set(
      Math.cos(layout.angle) * r,
      Math.sin(layout.angle) * r * 0.72 - this.sag * 0.55,
      Math.sin(layout.angle * 2) * 0.35 * this.join,
    )
    this.object.rotation.z = layout.angle

    const breathe = 1 + Math.sin(ctx.t * layout.breath * Math.PI * 2) * (0.03 + this.stress * 0.05)
    this.object.scale.setScalar(Math.max(this.join, 0.001) * (1 + this.focus * 0.45) * breathe)

    // hue when healthy, amber under pressure, gray when NotReady
    const color = this.#scratch.copy(this.#liveColor)
    color.lerp(this.#stressColor, this.stress * 0.7)
    color.lerp(this.#deadColor, this.sag)
    color.lerp(this.#white, Math.min(this.flash, 1) * 0.8)
    this.#hexMat.color.copy(color)
    this.#edgeMat.color.copy(color)
    this.flash *= 1 - ctx.ease(0.06)

    const alive = 1 - this.sag * 0.65
    this.#edgeMat.opacity = Math.min(1, (0.25 + 0.75 * this.join) * (1 - layout.dim) * alive + this.flash * 0.6)
    this.#hexMat.opacity = (0.16 + 0.3 * this.focus) * (1 - layout.dim) * alive

    // the vessel fills radially, so it reads face-on
    this.#level += (layout.memory - this.#level) * ctx.ease(0.03)
    const radial = Math.max(this.#level, 0.001)
    this.#fill.scale.set(radial, 1, radial)
    this.#fillMat.color.copy(color)
    this.#fillMat.opacity = (0.12 + 0.4 * this.#level) * (1 - layout.dim) * alive

    const cordonMat = this.#cordon.material as THREE.LineBasicMaterial
    cordonMat.opacity += ((v.schedulable ? 0 : 0.65) - cordonMat.opacity) * ctx.ease(0.04)
    this.#cordon.visible = cordonMat.opacity > 0.01
    this.#cordon.rotation.z = ctx.t * 0.6
  }

  /** 0..1, for anything that wants to know how full this node looks. */
  get level(): number {
    return this.#level
  }

  dispose(): void {
    this.object.removeFromParent()
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
    })
  }
}
