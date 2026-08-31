import type { DiagramOptions, Highlight, ResolvedOptions, ThemeTokens } from './types'

export const lightTheme: ThemeTokens = {
  background: '#ffffff',
  text: '#1e293b',
  textSecondary: '#475569',
  line: '#6366f1',
  lineResponse: '#10b981',
  nodeBackground: '#eef2ff',
  nodeBorder: '#6366f1',
  noteBackground: '#f8fafc',
  noteBorder: '#e2e8f0',
  highlight: '#10b981',
  highlightRed: '#ef4444',
  lifeline: 'rgba(99,102,241,0.3)',
}

export const darkTheme: ThemeTokens = {
  background: '#0f172a',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  line: '#818cf8',
  lineResponse: '#34d399',
  nodeBackground: '#312e81',
  nodeBorder: '#6366f1',
  noteBackground: '#334155',
  noteBorder: '#475569',
  highlight: '#34d399',
  highlightRed: '#f87171',
  lifeline: 'rgba(99,102,241,0.3)',
}

function autoTheme(): ThemeTokens {
  const prefersDark =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? darkTheme : lightTheme
}

const THEME_KEYS: (keyof ThemeTokens)[] = [
  'background', 'text', 'textSecondary', 'line', 'lineResponse',
  'nodeBackground', 'nodeBorder', 'noteBackground', 'noteBorder',
  'highlight', 'highlightRed', 'lifeline',
]

export function resolveTheme(theme: DiagramOptions['theme']): ThemeTokens {
  if (theme && typeof theme === 'object') {
    // A full ThemeTokens object is used exactly as given (same object, same
    // reference) — unchanged from before. A partial object merges over the
    // auto-resolved built-in theme, so unspecified tokens keep light/dark
    // adaptivity instead of silently going undefined.
    const isComplete = THEME_KEYS.every((k) => theme[k] !== undefined)
    return isComplete ? (theme as ThemeTokens) : { ...autoTheme(), ...theme }
  }
  if (theme === 'light') return lightTheme
  if (theme === 'dark') return darkTheme
  return autoTheme()
}

/** Shared highlight→color resolver for sequence/flowchart/state renderers.
 *  Returns undefined when unhighlighted, so callers can `?? <normal color>`. */
export function highlightColor(h: Highlight | undefined, t: ThemeTokens): string | undefined {
  if (!h) return undefined
  return h === 'red' ? t.highlightRed : t.highlight
}

export function resolveOptions(o: DiagramOptions = {}): ResolvedOptions {
  return {
    theme: resolveTheme(o.theme),
    animate: o.animate ?? true,
    trigger: o.trigger ?? 'onScroll',
    advance: o.advance ?? 'auto',
    keyboard: o.keyboard ?? false,
    stepDuration: o.stepDuration ?? 400,
    stepDelay: o.stepDelay ?? 100,
    replayOnScroll: o.replayOnScroll ?? true,
    width: o.width ?? '100%',
    height: o.height ?? 'auto',
    padding: o.padding ?? 40,
    fontFamily: o.fontFamily ?? 'system-ui, sans-serif',
    onComplete: o.onComplete,
    onStepStart: o.onStepStart,
  }
}
