import type { PodPhase, PressureKind } from '../../shared/protocol.js'
import type { NodeResource, PodResource } from './kinds.js'
import type { NodeObservation, PodObservation } from '../model/types.js'
import { parseCpu, parseMemory } from './metrics.js'

const PRESSURE_CONDITIONS: Record<string, PressureKind> = {
  MemoryPressure: 'memory',
  DiskPressure: 'disk',
  PIDPressure: 'pid',
}

const PULLING_REASONS = new Set(['ContainerCreating', 'PodInitializing', 'ImagePullBackOff', 'ErrImagePull'])

const iso = (v: Date | string | undefined): string =>
  v === undefined ? new Date(0).toISOString() : new Date(v).toISOString()

export function adaptNode(n: NodeResource): NodeObservation {
  const conditions = n.status?.conditions ?? []
  const ready = conditions.some((c) => c.type === 'Ready' && c.status === 'True')
  const pressure = conditions
    .filter((c) => c.status === 'True' && c.type in PRESSURE_CONDITIONS)
    .map((c) => PRESSURE_CONDITIONS[c.type]!)

  const labels = n.metadata?.labels ?? {}
  const isControlPlane =
    'node-role.kubernetes.io/control-plane' in labels || 'node-role.kubernetes.io/master' in labels

  return {
    view: {
      name: n.metadata?.name ?? 'unknown',
      role: isControlPlane ? 'control-plane' : 'worker',
      ready,
      schedulable: n.spec?.unschedulable !== true,
      pressure,
      version: n.status?.nodeInfo?.kubeletVersion ?? '',
      createdAt: iso(n.metadata?.creationTimestamp),
      inferred: false,
    },
  }
}

/**
 * A node seen only through the pods scheduled on it. Drawn as a healthy worker,
 * because nothing says otherwise; the panel says what is not known.
 */
export function inferNode(name: string): NodeObservation {
  return {
    view: {
      name,
      role: 'worker',
      ready: true,
      schedulable: true,
      pressure: [],
      version: '',
      createdAt: iso(undefined),
      inferred: true,
    },
  }
}

/**
 * Sum a limit across containers. One unbounded container makes the whole pod
 * unbounded, so the answer is null rather than a misleading partial total.
 * Init containers are excluded: they have exited by the time a pod runs.
 */
function limitOf(p: PodResource, key: 'cpu' | 'memory', parse: (q: string) => number): number | null {
  const containers = p.spec?.containers ?? []
  if (containers.length === 0) return null

  let total = 0
  for (const c of containers) {
    const raw = c.resources?.limits?.[key]
    if (raw === undefined) return null
    total += parse(raw)
  }
  return total
}

export function adaptPod(p: PodResource): PodObservation {
  const statuses = [
    ...(p.status?.initContainerStatuses ?? []),
    ...(p.status?.containerStatuses ?? []),
  ]
  const main = p.status?.containerStatuses ?? []

  let lastOomAt: string | null = null
  for (const s of statuses) {
    const term = s.lastState?.terminated
    if (term?.reason !== 'OOMKilled' || term.finishedAt === undefined) continue
    const at = iso(term.finishedAt)
    if (lastOomAt === null || at > lastOomAt) lastOomAt = at
  }

  return {
    view: {
      uid: p.metadata?.uid ?? '',
      name: p.metadata?.name ?? 'unknown',
      namespace: p.metadata?.namespace ?? 'default',
      node: p.spec?.nodeName ?? null,
      phase: (p.status?.phase as PodPhase | undefined) ?? 'Unknown',
      ready: (p.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True'),
      containersReady: [main.filter((s) => s.ready).length, main.length],
      restarts: statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0),
      ownerKey: p.metadata?.ownerReferences?.[0]?.uid ?? null,
      cpuLimitMillis: limitOf(p, 'cpu', parseCpu),
      memLimitBytes: limitOf(p, 'memory', parseMemory),
      createdAt: iso(p.metadata?.creationTimestamp),
    },
    deleting: p.metadata?.deletionTimestamp !== undefined,
    pulling: statuses.some((s) => PULLING_REASONS.has(s.state?.waiting?.reason ?? '')),
    crashloop: statuses.some((s) => s.state?.waiting?.reason === 'CrashLoopBackOff'),
    lastOomAt,
  }
}
