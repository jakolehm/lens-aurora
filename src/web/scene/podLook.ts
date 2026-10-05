import type { PodView } from '../../shared/protocol.js'
import type { NamespaceFocus } from '../state/focus.js'
import type { ActiveLens, LensName } from '../state/lens.js'
import type { NamespacePalette } from '../state/namespacePalette.js'
import type { WorkloadFocus } from '../state/workloadFocus.js'
import type { WorkloadIndex } from '../state/workloads.js'
import { workloadHue } from '../theme.js'

/** What a pod cube looks like at rest. The lens decides; the pod field only draws. */
export interface PodLook {
  colorOf(pod: PodView): number
  isGhosted(pod: PodView): boolean
}

export class NamespaceLook implements PodLook {
  readonly #palette: NamespacePalette
  readonly #focus: NamespaceFocus

  constructor(palette: NamespacePalette, focus: NamespaceFocus) {
    this.#palette = palette
    this.#focus = focus
  }

  colorOf(pod: PodView): number {
    return this.#palette.colorOf(pod.namespace)
  }

  isGhosted(pod: PodView): boolean {
    return this.#focus.isGhosted(pod.namespace)
  }
}

export class WorkloadLook implements PodLook {
  readonly #cluster: string
  readonly #workloads: WorkloadIndex
  readonly #focus: WorkloadFocus
  readonly #namespaces: NamespaceFocus

  constructor(cluster: string, workloads: WorkloadIndex, focus: WorkloadFocus, namespaces: NamespaceFocus) {
    this.#cluster = cluster
    this.#workloads = workloads
    this.#focus = focus
    this.#namespaces = namespaces
  }

  colorOf(pod: PodView): number {
    return workloadHue(this.#workloads.ofPod(pod.uid)?.kind ?? 'Pod')
  }

  /** A lit workload wins; without one, the rail's namespace focus applies as in the nodes lens. */
  isGhosted(pod: PodView): boolean {
    if (!this.#focus.active) return this.#namespaces.isGhosted(pod.namespace)
    return this.#focus.isGhosted(this.#cluster, this.#workloads.ofPod(pod.uid)?.key ?? null)
  }
}

/** Hands each question to whichever lens is on. */
export class LensLook implements PodLook {
  readonly #lens: ActiveLens
  readonly #looks: Readonly<Record<LensName, PodLook>>

  constructor(lens: ActiveLens, looks: Readonly<Record<LensName, PodLook>>) {
    this.#lens = lens
    this.#looks = looks
  }

  colorOf(pod: PodView): number {
    return this.#looks[this.#lens.name].colorOf(pod)
  }

  isGhosted(pod: PodView): boolean {
    return this.#looks[this.#lens.name].isGhosted(pod)
  }
}
