// Colours, carried over from luisg.me global.css. Nothing in Aurora picks
// a colour that is not in this file.

export const BG = 0x211f1e
export const IVORY = 0xf2efe9
export const MUTED = 0x9b948b
export const LINK_GRAY = 0x4a4542
export const RED = 0xff4b3a

/**
 * Heat cannot be a hue: the namespace palette already occupies all eight, so
 * a cool cert-manager pod (orange) would be indistinguishable from a hot
 * monitoring one. Heat runs on whiteness instead, which no swatch uses, so a
 * pale glowing cube means the same thing whatever namespace it belongs to.
 *
 * It stops short of RED, which belongs to crashloop and OOM: a hot but
 * healthy pod must not read as a dying one.
 */
export const WARM = 0xffb020
export const HOT = 0xfff4e2

/** Taxonomy hues, in the order global.css declares them. */
export const HUES = [0xff4b3a, 0xff9640, 0xefc43a, 0x4ecb71, 0x2fbf9a, 0x35c5de, 0x5b83ff, 0xa06bff] as const

/** Stable FNV-1a hash so a namespace always lands on the same hue. */
export function hueFor(namespace: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < namespace.length; i++) {
    h ^= namespace.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return HUES[h % HUES.length]!
}

/** Scale a colour toward black without shifting its hue. */
export function dim(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * factor)
  const g = Math.round(((hex >> 8) & 0xff) * factor)
  const b = Math.round((hex & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}

/**
 * Sixteen namespace swatches: the eight taxonomy hues, then a dimmer variant
 * of each. Eight is not enough for a real cluster, and a legend showing two
 * namespaces with the same dot is worse than no legend. Every swatch still
 * belongs to the existing family.
 */
export const NAMESPACE_SWATCHES: readonly number[] = [
  ...HUES,
  ...HUES.map((h) => dim(h, 0.62)),
]

/** The workloads lens colours a pod by what owns it, so a rollout reads as one colour. */
export const WORKLOAD_HUES: Readonly<Record<string, number>> = {
  Deployment: HUES[4],
  StatefulSet: HUES[1],
  DaemonSet: HUES[2],
  Job: HUES[6],
  CronJob: HUES[6],
  Pod: IVORY,
}
/** any other owner, such as an operator's own controller */
export const OTHER_WORKLOAD_HUE = HUES[7]

/** What a workload depends on, one hue each, so the panel and the scene agree. */
export const RELATED_HUES = {
  Ingress: HUES[6],
  Service: HUES[5],
  PersistentVolumeClaim: HUES[2],
  ConfigMap: HUES[3],
  Secret: HUES[7],
  ServiceAccount: MUTED,
} as const

export const workloadHue = (kind: string): number => WORKLOAD_HUES[kind] ?? OTHER_WORKLOAD_HUE

/** Where traffic enters, one hue per kind of entry, kept apart from the service hue it leads to. */
export const ENTRY_HUES = {
  Gateway: HUES[1],
  Ingress: HUES[6],
  LoadBalancer: HUES[2],
  NodePort: HUES[3],
} as const
