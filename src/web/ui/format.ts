export function formatAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function formatBytes(bytes: number): string {
  const gi = bytes / 1024 ** 3
  if (gi >= 1) return `${gi.toFixed(1)}Gi`
  return `${Math.round(bytes / 1024 ** 2)}Mi`
}

export function formatCpu(millis: number): string {
  if (millis >= 1000) return (millis / 1000).toFixed(2)
  return `${Math.round(millis)}m`
}
