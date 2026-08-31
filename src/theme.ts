import type { DiagramOptions, ResolvedOptions, ThemeTokens } from './types'

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

export function resolveTheme(theme: DiagramOptions['theme']): ThemeTokens {
  if (theme && typeof theme === 'object') return theme
  if (theme === 'light') return lightTheme
  if (theme === 'dark') return darkTheme
  const prefersDark =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? darkTheme : lightTheme
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
