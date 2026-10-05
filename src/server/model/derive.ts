// Pure transition rules: given the previous and next observation of one
// object, what did the cluster just *do*?

import type { SemanticEvent } from '../../shared/protocol.js'
import type { NodeObservation, PodObservation } from './types.js'

export function derivePod(prev: PodObservation | null, next: PodObservation | null): SemanticEvent[] {
  if (next === null) {
    // already dissolving when it vanished: the animation is running
    if (prev === null || prev.deleting) return []
    return [{ kind: 'pod.terminating', uid: prev.view.uid }]
  }

  const uid = next.view.uid
  const out: SemanticEvent[] = []

  if (next.deleting && (prev === null || !prev.deleting)) {
    return [{ kind: 'pod.terminating', uid }]
  }
  if (next.deleting) return []

  if (next.view.node !== null && (prev === null || prev.view.node === null)) {
    out.push({ kind: 'pod.scheduled', uid, node: next.view.node })
  }

  if (next.pulling && !(prev?.pulling ?? false)) {
    out.push({ kind: 'pod.pulling', uid })
  }

  // an OOM kill always bumps restartCount; show the implosion, not a plain restart
  const oomed = next.lastOomAt !== null && next.lastOomAt !== (prev?.lastOomAt ?? null)
  if (oomed) {
    out.push({ kind: 'pod.oomkilled', uid })
  } else if (prev !== null && next.view.restarts > prev.view.restarts) {
    out.push({ kind: 'pod.restart', uid, count: next.view.restarts })
  }

  if (next.crashloop && !(prev?.crashloop ?? false)) {
    out.push({ kind: 'pod.crashloop', uid })
  } else if (!next.crashloop && (prev?.crashloop ?? false)) {
    out.push({ kind: 'pod.crashloop.cleared', uid })
  }

  if (next.view.ready && !(prev?.view.ready ?? false)) {
    out.push({ kind: 'pod.ready', uid })
  }

  return out
}

export function deriveNode(prev: NodeObservation | null, next: NodeObservation | null): SemanticEvent[] {
  if (next === null) return []

  const name = next.view.name

  if (prev === null) {
    return next.view.ready ? [{ kind: 'node.joined', name }] : []
  }

  const out: SemanticEvent[] = []

  if (next.view.ready !== prev.view.ready) {
    out.push({ kind: next.view.ready ? 'node.recovered' : 'node.notready', name })
  }

  if (next.view.pressure.join(',') !== prev.view.pressure.join(',')) {
    out.push(
      next.view.pressure.length > 0
        ? { kind: 'node.pressure', name, kinds: next.view.pressure }
        : { kind: 'node.pressure.cleared', name },
    )
  }

  if (next.view.schedulable !== prev.view.schedulable) {
    out.push({ kind: next.view.schedulable ? 'node.uncordoned' : 'node.cordoned', name })
  }

  return out
}
