export interface Pt {
  x: number
  y: number
}

/** Midpoint-quadratic smoothing over dagre's polyline waypoints — identical
 *  curve to the flowchart renderer's, shared by the class/er renderers. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 3) return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q ${pts[i].x} ${pts[i].y}, ${mx} ${my}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/** Angle (degrees) of the final segment, for orienting end markers. */
export function endAngle(pts: Pt[]): number {
  const tip = pts[pts.length - 1]
  const prev = pts[pts.length - 2] ?? tip
  return (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI
}

/** Pull the final point back by `len` along the last segment so the path
 *  flows into an end marker instead of under it. */
export function trimEnd(pts: Pt[], len: number): Pt[] {
  if (len <= 0 || pts.length < 2) return pts
  const tip = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  const dx = tip.x - prev.x
  const dy = tip.y - prev.y
  const d = Math.hypot(dx, dy) || 1
  return [...pts.slice(0, -1), { x: tip.x - (dx / d) * len, y: tip.y - (dy / d) * len }]
}
