import type { SemanticEvent } from '../../../../shared/protocol.js'
import type { AnimContext } from '../types.js'
import { nodeCordoned, nodeUncordoned } from './cordoned.js'
import { nodeHeartbeat } from './heartbeat.js'
import { nodeJoined } from './joined.js'
import { nodeNotReady } from './notready.js'
import { nodePressure, nodePressureCleared } from './pressure.js'
import { nodeRecovered } from './recovered.js'

/** Returns true if this was a node event and was handled. */
export function dispatchNodeEvent(event: SemanticEvent, ctx: AnimContext): boolean {
  switch (event.kind) {
    case 'node.heartbeat': nodeHeartbeat(event.name, ctx); return true
    case 'node.joined': nodeJoined(event.name, ctx); return true
    case 'node.notready': nodeNotReady(event.name, ctx); return true
    case 'node.recovered': nodeRecovered(event.name, ctx); return true
    case 'node.pressure': nodePressure(event.name, ctx); return true
    case 'node.pressure.cleared': nodePressureCleared(event.name, ctx); return true
    case 'node.cordoned': nodeCordoned(event.name, ctx); return true
    case 'node.uncordoned': nodeUncordoned(event.name, ctx); return true
    default: return false
  }
}
