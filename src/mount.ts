import type { AnimStep } from './animator'
import {
  createDiagram,
  type ClickTarget,
  type InnerController,
  type MountSnapshot,
} from './controller'
import { resolveOptions } from './theme'
import type { DiagramController, DiagramOptions, ResolvedOptions } from './types'

export interface BuildResult {
  svg: SVGSVGElement
  steps: AnimStep[]
  clickTargets?: ClickTarget[]
  stepIndexOffset: number
}

const OPTION_KEYS: (keyof DiagramOptions)[] = [
  'theme', 'animate', 'trigger', 'advance', 'keyboard', 'stepDuration', 'stepDelay',
  'replayOnScroll', 'width', 'height', 'padding', 'fontFamily', 'onComplete', 'onStepStart',
]

/** Accept option keys written at the top level of a config (a very common
 *  slip — `{ type: 'sequence', ..., theme: 'light' }`) instead of silently
 *  ignoring them. Precedence: explicit `options` argument > `config.options`
 *  > top-level keys. */
export function gatherOptions(
  config: { options?: DiagramOptions },
  argOptions?: DiagramOptions,
): DiagramOptions {
  const raw = config as Record<string, unknown>
  const lifted: Record<string, unknown> = {}
  for (const key of OPTION_KEYS) {
    if (key in raw && raw[key] !== undefined) lifted[key] = raw[key]
  }
  return { ...(lifted as DiagramOptions), ...config.options, ...argOptions }
}

/** Builds the diagram and wires theme dynamics around it:
 *  - `theme: 'auto'` (or unset) re-renders in place when the OS color scheme
 *    changes, preserving playback position;
 *  - `controller.setTheme(...)` re-renders with a new theme on demand (for
 *    site-level dark-mode toggles), which also pins the theme until a later
 *    `setTheme('auto')`.
 *  Rebuilds restore the previous controller's exact state via its
 *  `snapshot()` — no callback re-fires, no replays. */
export function mountDiagram(
  container: HTMLElement,
  options: DiagramOptions | undefined,
  build: (opts: ResolvedOptions) => BuildResult,
): DiagramController {
  let themeOverride: DiagramOptions['theme'] | undefined
  let destroyed = false

  const currentOptions = (): DiagramOptions => ({
    ...options,
    ...(themeOverride !== undefined ? { theme: themeOverride } : {}),
  })

  const make = (initial?: MountSnapshot): InnerController => {
    const resolved = resolveOptions(currentOptions())
    const built = build(resolved)
    return createDiagram(
      container,
      built.svg,
      built.steps,
      resolved,
      built.stepIndexOffset,
      built.clickTargets,
      initial,
    )
  }
  let inner = make()

  const rebuild = (): void => {
    const snap = inner.snapshot()
    inner.destroy() // removes the old svg from the container
    inner = make(snap)
  }

  // Follow the OS color scheme only while the theme is auto (explicitly or
  // by default). Explicit themes — including ones set via setTheme — don't.
  const autoThemed = (): boolean => {
    const t = currentOptions().theme
    return t === undefined || t === 'auto'
  }
  let unsubscribe: (() => void) | undefined
  if (typeof matchMedia !== 'undefined') {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    if (typeof mq.addEventListener === 'function') {
      const onChange = (): void => {
        if (!destroyed && autoThemed()) rebuild()
      }
      mq.addEventListener('change', onChange)
      unsubscribe = () => mq.removeEventListener('change', onChange)
    }
  }

  return {
    play: () => inner.play(),
    reset: () => inner.reset(),
    pause: () => inner.pause(),
    resume: () => inner.resume(),
    goToStep: (n) => inner.goToStep(n),
    setTheme: (theme) => {
      if (destroyed) return
      themeOverride = theme
      rebuild()
    },
    destroy: () => {
      destroyed = true
      unsubscribe?.()
      inner.destroy()
    },
  }
}
