import * as THREE from 'three'
import type { ClusterState } from '../state/cluster.js'
import { LINK_GRAY } from '../theme.js'
import { fibonacciPoint, shellRadius } from './fibonacci.js'
import { podHeat, podPulseFromHeat, podScaleFromMemory, podSpinFromCpu } from './metricsVisual.js'
import type { PodLook } from './podLook.js'
import type { FrameContext } from './world.js'

interface Slot {
  /** instance index in the mesh, recycled when pods come and go */
  index: number
  /** eased 0..1 presence; 0 means gone */
  alive: number
  target: number
  /** scale multiplier that event animations drive */
  scale: number
  /** transient positional offset from shockwaves and jitter */
  offset: THREE.Vector3
  color: THREE.Color
  baseColor: THREE.Color
  phase: number
  /** per-pod tumble character, so identical loads still look individual */
  spin: number
  /** accumulated tumble angle; integrated so the rate can change smoothly */
  angle: number
  /** eased size from working set */
  size: number
  /** eased tumble multiplier from CPU */
  haste: number
  /** eased 0..1, how far this pod has receded behind the lens's focus */
  ghost: number
  /** eased 0..1, how close this pod is to its own resource ceiling */
  heat: number
  /** true while an event animation owns the colour, so heat stands aside */
  override: boolean
}

const GROWTH = 32
/** scale for an instance that holds no pod; zero exactly can upset raycasts */
/** how far past its resting radius a fully hot pod is pushed */
const HEAT_SPREAD = 0.85
const PARKED = 0.0001
/** shared parked transform, so nothing has to rebuild it per instance */
const PARKED_MATRIX = new THREE.Matrix4().makeScale(PARKED, PARKED, PARKED)

/**
 * The shell of pods orbiting one node, drawn as a single instanced mesh.
 * Parented to the node's group, so pods inherit its transform for free.
 */
export class PodField {
  readonly #parent: THREE.Object3D
  readonly #rig: THREE.Object3D
  readonly #state: ClusterState
  readonly #slots = new Map<string, Slot>()
  readonly #free: number[] = []
  readonly #dummy = new THREE.Object3D()
  readonly #v = new THREE.Vector3()
  readonly #used = new Set<number>()
  // ghosts blend toward the link gray, not the lighter muted tone: on a dark
  // stage a pale ghost stays louder than the thing it is meant to defer to
  readonly #ghostColor = new THREE.Color(LINK_GRAY)
  readonly #shown = new THREE.Color()
  readonly #look: PodLook
  #mesh: THREE.InstancedMesh
  #capacity = GROWTH
  #visible = true

  constructor(
    parent: THREE.Object3D,
    rig: THREE.Object3D,
    state: ClusterState,
    look: PodLook,
  ) {
    this.#parent = parent
    this.#rig = rig
    this.#state = state
    this.#look = look
    this.#mesh = this.#build(this.#capacity)
    parent.add(this.#mesh)
  }


  get mesh(): THREE.InstancedMesh {
    return this.#mesh
  }

  set shown(shown: boolean) {
    this.#visible = shown
    this.#mesh.visible = shown
  }

  #build(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      shadedCube(0.09),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, vertexColors: true }),
      capacity,
    )
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    mesh.frustumCulled = false
    mesh.visible = this.#visible
    mesh.userData['podField'] = this

    // Every instance starts parked. An untouched slot would otherwise render
    // with the identity matrix and a zeroed colour: a full-size black cube
    // sitting at the node's centre.
    this.#dummy.position.set(0, 0, 0)
    this.#dummy.rotation.set(0, 0, 0)
    this.#dummy.scale.setScalar(PARKED)
    this.#dummy.updateMatrix()
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, this.#dummy.matrix)
    mesh.instanceMatrix.needsUpdate = true

    return mesh
  }

  #grow(): void {
    const old = this.#mesh
    this.#capacity += GROWTH
    const next = this.#build(this.#capacity)
    this.#parent.remove(old)
    old.geometry.dispose()
    ;(old.material as THREE.Material).dispose()
    this.#parent.add(next)
    this.#mesh = next
  }

  /** Add and remove slots so they match the pods currently on this node. */
  sync(uids: string[]): void {
    const wanted = new Set(uids)

    // mark departures; the frame loop dissolves them before freeing the slot
    for (const [uid, slot] of this.#slots) {
      if (!wanted.has(uid)) slot.target = 0
    }

    for (const uid of uids) {
      const existing = this.#slots.get(uid)
      if (existing !== undefined) {
        existing.target = 1
        continue
      }
      const view = this.#state.pods.get(uid)
      if (view === undefined) continue

      let index = this.#free.pop()
      if (index === undefined) {
        index = this.#slots.size
        if (index >= this.#capacity) this.#grow()
      }
      const color = new THREE.Color(this.#look.colorOf(view))
      this.#slots.set(uid, {
        index,
        alive: 0,
        target: 1,
        scale: 1,
        offset: new THREE.Vector3(),
        color: color.clone(),
        baseColor: color,
        phase: Math.random() * Math.PI * 2,
        // a random per-pod rate would mask CPU entirely: an idle pod could
        // out-spin a busy one. Only the starting angle stays random, which
        // keeps the swarm unsynchronised without corrupting the measurement.
        spin: 1,
        angle: Math.random() * Math.PI * 2,
        size: podScaleFromMemory(this.#state.metrics.pods[uid]?.memBytes ?? 0),
        haste: podSpinFromCpu(this.#state.metrics.pods[uid]?.cpuMillis ?? 0),
        ghost: 0,
        heat: 0,
        override: false,
      })
    }
  }

  /**
   * The furthest a pod of this field can currently sit from its node, with
   * heat fully applied. The ring uses it to keep clouds from overlapping.
   */
  /** How far the pods sit from their centre at rest, before heat pushes them out. */
  restingReach(): number {
    return shellRadius(Math.max(this.#slots.size, 1))
  }

  reach(): number {
    return shellRadius(Math.max(this.#slots.size, 1)) * (1 + HEAT_SPREAD)
  }

  slotOf(uid: string): number | null {
    return this.#slots.get(uid)?.index ?? null
  }

  scaleOf(uid: string): number {
    return this.#slots.get(uid)?.scale ?? 0
  }

  setScale(uid: string, value: number): void {
    const slot = this.#slots.get(uid)
    if (slot !== undefined) slot.scale = value
  }

  /** An event animation taking the colour. Heat defers until it is released. */
  setColor(uid: string, color: THREE.Color): void {
    const slot = this.#slots.get(uid)
    if (slot === undefined) return
    slot.color.copy(color)
    slot.override = true
  }

  /** Hand the colour back to the resting heat tint. */
  releaseColor(uid: string): void {
    const slot = this.#slots.get(uid)
    if (slot !== undefined) slot.override = false
  }

  baseColorOf(uid: string): THREE.Color | null {
    return this.#slots.get(uid)?.baseColor ?? null
  }

  /** Push a pod off its resting position; it eases back on its own. */
  nudge(uid: string, delta: THREE.Vector3): void {
    this.#slots.get(uid)?.offset.add(delta)
  }

  has(uid: string): boolean {
    return this.#slots.has(uid)
  }

  uids(): string[] {
    return [...this.#slots.keys()]
  }

  /** Position in rig-local space, the shared space for effects. */
  rigPositionOf(uid: string, out: THREE.Vector3): boolean {
    const ordinal = this.#ordinalOf(uid)
    const slot = this.#slots.get(uid)
    if (slot === undefined || ordinal === -1) return false
    this.#restingPosition(ordinal, this.#slots.size, slot.phase, slot.heat, 0, out).add(slot.offset)
    this.#mesh.localToWorld(out)
    this.#rig.worldToLocal(out)
    return true
  }

  #ordinalOf(uid: string): number {
    let i = 0
    for (const key of this.#slots.keys()) {
      if (key === uid) return i
      i++
    }
    return -1
  }

  /**
   * Uses the dense ordinal rather than the recycled instance index, so the
   * shell stays evenly distributed no matter how slots were reused.
   */
  #restingPosition(
    ordinal: number,
    count: number,
    phase: number,
    heat: number,
    strain: number,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    fibonacciPoint(ordinal, Math.max(count, 1), out)
    const x = out.x * Math.cos(phase) - out.z * Math.sin(phase)
    const z = out.x * Math.sin(phase) + out.z * Math.cos(phase)
    // Heat pushes a pod out along its own radius. Position is the one channel
    // the namespace palette does not already own, so distance from the node
    // compares honestly across every namespace, and a straining node reads as
    // a silhouette without looking at any single cube.
    return out.set(x, out.y, z).multiplyScalar(shellRadius(count) * (1 + heat * HEAT_SPREAD + strain))
  }

  update(ctx: FrameContext, dim: number, ambient = 1): void {
    const count = Math.max(this.#slots.size, 1)
    const material = this.#mesh.material as THREE.MeshBasicMaterial
    material.opacity = 1 - dim

    this.#used.clear()
    let ordinal = 0
    for (const [uid, slot] of this.#slots) {
      slot.phase += ctx.dt * 0.12 * ambient
      slot.alive += (slot.target - slot.alive) * ctx.ease(0.06)
      slot.offset.multiplyScalar(1 - ctx.ease(0.07))

      // load drives form: bigger with memory, faster with CPU. Eased, because
      // metrics land in 5s steps and should not arrive as a pop.
      const m = this.#state.metrics.pods[uid]
      slot.size += (podScaleFromMemory(m?.memBytes ?? 0) - slot.size) * ctx.ease(0.03)
      slot.haste += (podSpinFromCpu(m?.cpuMillis ?? 0) - slot.haste) * ctx.ease(0.03)
      slot.angle += ctx.dt * slot.spin * slot.haste

      // the lens can change under a pod, so its colour is asked for every
      // frame; an animation holding the colour gets it back when it lets go
      const view = this.#state.pods.get(uid)
      if (view !== undefined && !slot.override) {
        slot.baseColor.setHex(this.#look.colorOf(view))
        slot.color.copy(slot.baseColor)
      }
      if (view !== undefined) {
        const want = podHeat(
          { cpuMillis: m?.cpuMillis ?? 0, memBytes: m?.memBytes ?? 0 },
          { cpuLimitMillis: view.cpuLimitMillis, memLimitBytes: view.memLimitBytes },
        )
        slot.heat += (want - slot.heat) * ctx.ease(0.03)
      }

      // whatever the lens is not focused on recedes: smaller and greyer, but
      // still in place, so the cluster keeps its shape
      const wantGhost = view !== undefined && this.#look.isGhosted(view) ? 1 : 0
      slot.ghost += (wantGhost - slot.ghost) * ctx.ease(0.08)

      if (slot.target === 0 && slot.alive < 0.02) {
        this.#free.push(slot.index)
        this.#slots.delete(uid)
        continue
      }

      // hot pods also strain in and out a little, so pressure reads as
      // restlessness rather than a static ring
      const strain =
        slot.heat < 0.02
          ? 0
          : Math.sin(ctx.t * podPulseFromHeat(slot.heat) * Math.PI * 2) * 0.05 * slot.heat
      this.#restingPosition(ordinal++, count, slot.phase, slot.heat, strain, this.#v).add(slot.offset)
      this.#dummy.position.copy(this.#v)
      this.#dummy.rotation.set(slot.angle, slot.angle * 0.7, 0)
      // slot.scale belongs to the event animations; size is the metric on top
      const receded = 1 - slot.ghost * 0.55
      this.#dummy.scale.setScalar(Math.max(slot.alive * slot.scale * slot.size * receded, PARKED))
      this.#dummy.updateMatrix()
      this.#mesh.setMatrixAt(slot.index, this.#dummy.matrix)
      this.#mesh.setColorAt(slot.index, this.#paint(slot, ctx.t))

      this.#used.add(slot.index)
    }

    // park whatever a departing pod left behind
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#used.has(i)) continue
      this.#mesh.setMatrixAt(i, PARKED_MATRIX)
    }

    this.#mesh.instanceMatrix.needsUpdate = true
    if (this.#mesh.instanceColor !== null) this.#mesh.instanceColor.needsUpdate = true
    // three keeps the sphere it hit-tests against from the first click; the
    // pods have moved since, so let the next click measure them again
    this.#mesh.boundingSphere = null
  }

  /**
   * The cube itself only ever carries its namespace hue, whatever an
   * animation has done to it, and how ghosted it is. Heat lives entirely on
   * the separate additive shell, because anything derived from this colour
   * would be confounded by it.
   */
  #paint(slot: Slot, t: number): THREE.Color {
    void t
    const out = this.#shown.copy(slot.color)

    return out.lerp(this.#ghostColor, slot.ghost * 0.88)
  }

  dispose(): void {
    this.#mesh.removeFromParent()
    this.#mesh.geometry.dispose()
    ;(this.#mesh.material as THREE.Material).dispose()
  }
}

/** How bright each pair of faces is, by the axis it faces along. */
const FACE_SHADES = { x: 0.62, y: 0.8, z: 1 } as const

/**
 * A cube whose faces carry fixed shades, multiplied into each pod's colour.
 * Unlit, a cube is one flat silhouette up close; this keeps it reading as a
 * solid without lights, and its brightest faces stay the namespace's hue.
 */
function shadedCube(size: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(size, size, size)
  const normals = geometry.getAttribute('normal')
  const colors = new Float32Array(normals.count * 3)
  for (let i = 0; i < normals.count; i++) {
    const shade =
      normals.getX(i) !== 0 ? FACE_SHADES.x : normals.getY(i) !== 0 ? FACE_SHADES.y : FACE_SHADES.z
    colors.fill(shade, i * 3, i * 3 + 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}
