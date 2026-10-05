import * as THREE from 'three'
import type { NetworkView } from '../shared/network.js'
import type { ServerMessage } from '../shared/protocol.js'
import type { WorkloadView } from '../shared/workloads.js'
import { ClusterView } from './clusterView.js'
import { CameraRig, fitDistance } from './scene/camera.js'
import { fleetRadius, layoutFleet } from './scene/fleetLayout.js'
import { HoverTracker } from './scene/hover.js'
import type { Tag } from './scene/tag.js'
import { Picker, type Pick, type Picked } from './scene/picking.js'
import { LensLook, NamespaceLook, WorkloadLook } from './scene/podLook.js'
import { World, type FrameContext } from './scene/world.js'
import { NamespaceFocus } from './state/focus.js'
import { ActiveLens } from './state/lens.js'
import { NamespacePalette } from './state/namespacePalette.js'
import { NetworkIndex } from './state/network.js'
import { BG } from './theme.js'
import { WorkloadFocus } from './state/workloadFocus.js'
import { WorkloadIndex } from './state/workloads.js'
import { InfoPanel } from './ui/panel.js'
import { Rail } from './ui/rail.js'
import { EntryList } from './ui/entryList.js'
import { WorkloadList } from './ui/workloadList.js'

/** The rail's right edge, and the size below which aurora.css hides it. */
const RAIL_INSET = 16 + 232
const RAIL_MIN_WIDTH = 640
const RAIL_MIN_HEIGHT = 520

const railInset = (width: number, height: number): number =>
  width > RAIL_MIN_WIDTH && height > RAIL_MIN_HEIGHT ? RAIL_INSET : 0

/** Matches `.aurora-tag`: 10px mono type, beside its point or centred below it. */
const TAG_CHAR_WIDTH = 6.2
const TAG_HEIGHT = 14
const TAG_OFFSET = 10

interface TagBox {
  left: number
  top: number
  right: number
  bottom: number
}

function tagBox({ text, place }: Tag, x: number, y: number): TagBox {
  const width = text.length * TAG_CHAR_WIDTH
  return place === 'beside'
    ? { left: x + TAG_OFFSET, top: y - TAG_HEIGHT / 2, right: x + TAG_OFFSET + width, bottom: y + TAG_HEIGHT / 2 }
    : { left: x - width / 2, top: y, right: x + width / 2, bottom: y + TAG_HEIGHT }
}

const overlaps = (a: TagBox, b: TagBox): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** A cluster as a whole when `target` is null, or one thing inside it. */
interface Selection {
  cluster: string
  target: Picked | null
}

/** Every connected cluster in one space, under one camera and one rail. */
export class Aurora {
  readonly lens = new ActiveLens()
  readonly #canvas: HTMLCanvasElement
  readonly #host: HTMLElement
  readonly #world: World
  readonly #palette = new NamespacePalette()
  readonly #focus = new NamespaceFocus()
  readonly #namespaceLook = new NamespaceLook(this.#palette, this.#focus)
  readonly #workloadFocus = new WorkloadFocus()
  readonly #cameraRig: CameraRig
  readonly #panel: InfoPanel
  readonly #rail: Rail
  readonly #clusters = new Map<string, ClusterView>()
  readonly #labels = new Map<string, HTMLElement>()
  readonly #tags: HTMLElement[] = []

  readonly #focusPos = new THREE.Vector3()
  readonly #projected = new THREE.Vector3()
  #selected: Selection | null = null
  #lastPanelRefresh = 0
  #lastRailRefresh = 0
  #framedRadius = 3

  constructor(host: HTMLElement, { background = BG }: { background?: number } = {}) {
    this.#host = host
    host.style.setProperty('--bg', `#${background.toString(16).padStart(6, '0')}`)
    host.classList.add('aurora-scene')

    this.#canvas = document.createElement('canvas')
    this.#canvas.className = 'aurora-scene__canvas'
    // focusable, so the keyboard shortcuts reach this scene and nothing else in Lens
    this.#canvas.tabIndex = 0
    host.append(this.#canvas)

    this.#world = new World(this.#canvas, { leftInset: railInset, background })
    this.#cameraRig = new CameraRig(this.#world.camera, this.#canvas, this.#world.ambient)
    new HoverTracker(this.#world, () => this.#clusters.values()).attach(this.#canvas)
    this.#panel = new InfoPanel(host, () => this.#closePanel())
    this.#rail = new Rail(host, {
      clusters: () => [...this.#clusters.values()],
      palette: this.#palette,
      focus: this.#focus,
      lens: this.lens,
      lists: {
        workloads: new WorkloadList({
          clusters: () => [...this.#clusters.values()],
          focus: this.#workloadFocus,
          onWorkloadClick: ({ cluster, key }) => this.#select({ cluster, target: { kind: 'workload', key } }),
        }),
        network: new EntryList({
          clusters: () => [...this.#clusters.values()],
          selected: () =>
            this.#selected?.target?.kind === 'entry' ? { cluster: this.#selected.cluster, key: this.#selected.target.key } : null,
          onEntryClick: ({ cluster, key }) => this.#select({ cluster, target: { kind: 'entry', key } }),
        }),
      },
      onClusterClick: (id) => this.#select({ cluster: id, target: null }),
    })

    // what was selected moves to a different place, or is gone, in the other lens
    this.lens.onChange(() => {
      if (this.#selected !== null && this.#selected.target?.kind !== 'core') this.#closePanel()
    })

    // keep the whole fleet framed when the tab changes size
    this.#world.onResize(() => this.#cameraRig.reframe())

    new Picker(this.#world, (pick) => this.#select(this.#throughLens(pick))).attach(this.#canvas)

    this.#world.add((ctx) => this.#frame(ctx))
  }

  addCluster(id: string, name: string): void {
    if (this.#clusters.has(id)) return
    const workloads = new WorkloadIndex()
    const look = new LensLook(this.lens, {
      nodes: this.#namespaceLook,
      workloads: new WorkloadLook(id, workloads, this.#workloadFocus, this.#focus),
      network: this.#namespaceLook,
    })
    const network = new NetworkIndex()
    const view = new ClusterView(id, name, this.#world, { workloads, network, look, lens: this.lens, palette: this.#palette })
    this.#clusters.set(id, view)

    workloads.onChange(() => {
      const target = this.#selected?.cluster === id ? this.#selected.target : null
      if (target?.kind === 'workload' && workloads.get(target.key) === undefined) this.#select(null)
      if (target?.kind === 'namespace' && ![...workloads.all].some((w) => w.namespace === target.name)) this.#select(null)
    })
    network.onChange(() => {
      const target = this.#selected?.cluster === id ? this.#selected.target : null
      if (target?.kind === 'entry' && network.entry(target.key) === undefined) this.#select(null)
      if (target?.kind === 'service' && network.service(target.key) === undefined) this.#select(null)
    })

    // drop focus if the thing being watched disappears
    view.state.onChange((change) => {
      const target = this.#selected?.cluster === id ? this.#selected.target : null
      if (target?.kind === 'pod' && change.removedPods.includes(target.uid)) this.#select(null)
      if ((target?.kind === 'node' || target?.kind === 'core') && change.removedNodes.includes(target.name)) this.#select(null)
    })

    const label = document.createElement('div')
    label.className = 'aurora-label'
    label.textContent = name
    this.#host.append(label)
    this.#labels.set(id, label)
  }

  apply(id: string, message: ServerMessage): void {
    const view = this.#clusters.get(id)
    if (view === undefined) return
    for (const event of view.apply(message)) this.#rail.push(event, view)
  }

  /** Empty while the workloads lens is off: nothing is watched for it then. */
  setWorkloads(id: string, workloads: readonly WorkloadView[]): void {
    this.#clusters.get(id)?.workloads.set(workloads)
  }

  /** Empty while the network lens is off: nothing is watched for it then. */
  setNetwork(id: string, network: NetworkView): void {
    this.#clusters.get(id)?.network.set(network)
  }

  removeCluster(id: string): void {
    if (this.#selected?.cluster === id) this.#select(null)
    this.#clusters.get(id)?.dispose()
    this.#clusters.delete(id)
    this.#labels.get(id)?.remove()
    this.#labels.delete(id)
  }

  dispose(): void {
    for (const id of [...this.#clusters.keys()]) this.removeCluster(id)
    this.#world.dispose()
    this.#panel.dispose()
    this.#rail.dispose()
    for (const tag of this.#tags) tag.remove()
    this.#canvas.remove()
  }

  /** Recomputes the framing target; called every frame so focus tracks motion. */
  #trackFocus(): boolean {
    const selected = this.#selected
    if (selected === null) return false
    const view = this.#clusters.get(selected.cluster)
    if (view === undefined) return false

    if (selected.target === null) {
      view.anchor.getWorldPosition(this.#focusPos)
      const camera = this.#world.camera
      this.#cameraRig.focusOn(this.#focusPos, fitDistance(camera.aspect, camera.fov, view.radius()))
      return true
    }

    if (!view.positionOf(selected.target, this.#focusPos)) return false
    const reach = view.reachOf(selected.target)
    if (reach !== null) {
      const camera = this.#world.camera
      this.#cameraRig.focusOn(this.#focusPos, fitDistance(camera.aspect, camera.fov, reach))
      return true
    }
    const distance = selected.target.kind === 'core' ? 5.0 : selected.target.kind === 'node' ? 4.2 : 1.7
    this.#cameraRig.focusOn(this.#focusPos, distance)
    return true
  }

  /** In the workloads lens a pod stands for its workload. */
  #throughLens(pick: Pick | null): Selection | null {
    if (pick === null || pick.target.kind !== 'pod' || this.lens.name !== 'workloads') return pick
    const workload = this.#clusters.get(pick.cluster)?.workloads.ofPod(pick.target.uid)
    return workload === undefined ? pick : { cluster: pick.cluster, target: { kind: 'workload', key: workload.key } }
  }

  #select(selection: Selection | null): void {
    this.#selected = selection
    if (selection === null || !this.#trackFocus()) {
      this.#cameraRig.release()
      this.#closePanel()
      return
    }
    const target = selection.target
    this.#workloadFocus.select(target?.kind === 'workload' ? { cluster: selection.cluster, key: target.key } : null)
    const view = this.#clusters.get(selection.cluster)
    if (target === null || view === undefined) this.#panel.hide()
    else this.#panel.show(target, view)
  }

  /** Stops following and closes the panel, but leaves the camera where it is. */
  #closePanel(): void {
    this.#selected = null
    this.#workloadFocus.select(null)
    this.#panel.hide()
  }

  #frame(ctx: FrameContext): void {
    const views = [...this.#clusters.values()]
    const radii = views.map((v) => v.radius())
    const placements = layoutFleet(radii)

    // clusters glide to their place as the fleet grows, shrinks or widens
    views.forEach((view, i) => {
      const p = placements[i]!
      view.anchor.position.x += (p.x - view.anchor.position.x) * ctx.ease(0.05)
      view.anchor.position.y += (p.y - view.anchor.position.y) * ctx.ease(0.05)
      view.update(ctx, this.#selected?.cluster === view.id ? this.#selected.target : null)
    })

    // only re-frame when the fleet's extent actually changed; doing it every
    // frame would undo the user's scroll wheel on the next tick
    const contentRadius = Math.max(fleetRadius(placements, radii), 1)
    this.#cameraRig.setContentRadius(contentRadius)
    if (this.#selected === null && Math.abs(contentRadius - this.#framedRadius) > this.#framedRadius * 0.08) {
      this.#framedRadius = contentRadius
      this.#cameraRig.reframe()
    }

    if (this.#trackFocus() && this.#selected?.target !== null) {
      const [x, y] = this.#toScreen(this.#focusPos)
      this.#panel.track(x, y)
      // metrics land every 5s; repaint at 2Hz so ages tick over too
      if (ctx.t - this.#lastPanelRefresh > 0.5) {
        this.#lastPanelRefresh = ctx.t
        this.#panel.refresh()
      }
    }
    this.#cameraRig.update(ctx)
    this.#world.setViewDistance(this.#cameraRig.distance)

    this.#placeLabels(views)
    this.#placeTags(views)

    // metrics arrive without a model change, so the totals need their own beat
    if (ctx.t - this.#lastRailRefresh > 2) {
      this.#lastRailRefresh = ctx.t
      this.#rail.refresh()
    }
  }

  /** Each cluster's name sits just below it, following the camera. */
  #placeLabels(views: readonly ClusterView[]): void {
    const below = new THREE.Vector3()
    for (const view of views) {
      const label = this.#labels.get(view.id)
      if (label === undefined) continue
      view.anchor.getWorldPosition(below)
      below.y -= view.radius()
      const [x, y, behind] = this.#toScreen(below)
      label.hidden = behind
      label.style.left = `${x}px`
      label.style.top = `${y}px`
    }
  }

  /**
   * Names next to things in the scene, from a pool of elements. Tags come
   * most wanted first, and one that would cover a name already placed is left
   * out, so a crowded ring stays readable.
   */
  #placeTags(views: readonly ClusterView[]): void {
    const placed: TagBox[] = []
    const tags = views
      .flatMap((view) => view.tags())
      .flatMap((tag) => {
        const [x, y, behind] = this.#toScreen(tag.at)
        const box = tagBox(tag, x, y)
        if (behind || placed.some((other) => overlaps(box, other))) return []
        placed.push(box)
        return [{ ...tag, x, y }]
      })
    while (this.#tags.length < tags.length) {
      const el = document.createElement('div')
      el.className = 'aurora-tag'
      this.#host.append(el)
      this.#tags.push(el)
    }
    this.#tags.forEach((el, i) => {
      const tag = tags[i]
      el.hidden = tag === undefined
      if (tag === undefined) return
      el.textContent = tag.text
      el.dataset['place'] = tag.place
      el.style.left = `${tag.x}px`
      el.style.top = `${tag.y}px`
    })
  }

  #toScreen(position: THREE.Vector3): [x: number, y: number, behind: boolean] {
    this.#projected.copy(position).project(this.#world.camera)
    return [
      (this.#projected.x * 0.5 + 0.5) * this.#canvas.clientWidth,
      (-this.#projected.y * 0.5 + 0.5) * this.#canvas.clientHeight,
      this.#projected.z > 1,
    ]
  }
}
