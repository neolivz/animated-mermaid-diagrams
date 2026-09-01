/** Categorical palette — mid-tone hues legible on both built-in themes.
 *  Shared by the pie, sankey, gitgraph, and mindmap renderers. Cycles with a
 *  +1 shift per lap so a wrap never repeats its neighbor's color. Not
 *  theme-customizable in this version. */
export const PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f97316', // orange
  '#64748b', // slate
]

export function paletteColor(i: number): string {
  return PALETTE[(i + Math.floor(i / PALETTE.length)) % PALETTE.length]
}
