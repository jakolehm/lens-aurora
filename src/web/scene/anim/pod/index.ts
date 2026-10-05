import type { SemanticEvent } from '../../../../shared/protocol.js'
import type { AnimContext } from '../types.js'
import { podCrashloop, podCrashloopCleared } from './crashloop.js'
import { podMigrated } from './migrated.js'
import { podOomkilled } from './oomkilled.js'
import { podPulling } from './pulling.js'
import { podReady } from './ready.js'
import { podRestart } from './restart.js'
import { podScheduled } from './scheduled.js'
import { podTerminating } from './terminating.js'

/** Returns true if this was a pod event and was handled. */
export function dispatchPodEvent(event: SemanticEvent, ctx: AnimContext): boolean {
  switch (event.kind) {
    case 'pod.scheduled': podScheduled(event.uid, event.node, ctx); return true
    case 'pod.pulling': podPulling(event.uid, ctx); return true
    case 'pod.ready': podReady(event.uid, ctx); return true
    case 'pod.restart': podRestart(event.uid, ctx); return true
    case 'pod.crashloop': podCrashloop(event.uid, ctx); return true
    case 'pod.crashloop.cleared': podCrashloopCleared(event.uid, ctx); return true
    case 'pod.oomkilled': podOomkilled(event.uid, ctx); return true
    case 'pod.terminating': podTerminating(event.uid, ctx); return true
    case 'pod.migrated': podMigrated(event.uid, event.from, event.to, ctx); return true
    default: return false
  }
}
