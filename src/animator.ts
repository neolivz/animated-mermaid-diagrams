export type AnimKind = 'fade' | 'scale' | 'draw' | 'drawDash'

export interface AnimTarget {
  el: SVGElement
  kind: AnimKind
}

export type AnimStep = AnimTarget[]

export interface AnimatorOpts {
  stepDuration: number
  stepDelay: number
  onStepStart?: (index: number) => void
  onComplete?: () => void
}

function pathLength(e: SVGElement): number {
  const g = e as SVGGeometryElement
  if (typeof g.getTotalLength === 'function') {
    try {
      return g.getTotalLength()
    } catch {
      /* detached or unsupported — fall through */
    }
  }
  const num = (a: string): number => parseFloat(e.getAttribute(a) ?? '0')
  if (e.tagName === 'line') return Math.hypot(num('x2') - num('x1'), num('y2') - num('y1'))
  return 300
}

/** Dash pattern that looks dashed while supporting a dashoffset "draw" reveal:
 *  repeats dash/gap to cover the path, then one full-length gap. */
function dashedDrawArray(len: number, dash = 6, gap = 4): string {
  const parts: number[] = []
  for (let acc = 0; acc < len; acc += dash + gap) parts.push(dash, gap)
  parts.push(0, Math.ceil(len))
  return parts.join(' ')
}

function hide(t: AnimTarget): void {
  const s = t.el.style
  if (t.kind === 'fade' || t.kind === 'scale') {
    s.opacity = '0'
    if (t.kind === 'scale') {
      s.transformBox = 'fill-box'
      s.transformOrigin = 'center'
      s.transform = 'scale(0.85)'
    }
  } else {
    const len = pathLength(t.el)
    s.strokeDasharray = t.kind === 'draw' ? String(len) : dashedDrawArray(len)
    s.strokeDashoffset = String(len)
  }
}

function show(t: AnimTarget): void {
  const s = t.el.style
  s.opacity = ''
  s.transform = ''
  s.strokeDasharray = ''
  s.strokeDashoffset = ''
}

function animateTarget(t: AnimTarget, duration: number): Animation | null {
  const target = t.el as SVGElement & {
    animate?: (k: Keyframe[], o: KeyframeAnimationOptions) => Animation
  }
  show(t) // final state once the animation ends
  if (typeof target.animate !== 'function') return null
  let frames: Keyframe[]
  if (t.kind === 'fade') {
    frames = [{ opacity: 0 }, { opacity: 1 }]
  } else if (t.kind === 'scale') {
    frames = [
      { opacity: 0, transform: 'scale(0.85)' },
      { opacity: 1, transform: 'scale(1)' },
    ]
  } else {
    const len = pathLength(t.el)
    const dash = t.kind === 'draw' ? String(len) : dashedDrawArray(len)
    frames = [
      { strokeDashoffset: len, strokeDasharray: dash },
      { strokeDashoffset: 0, strokeDasharray: dash },
    ]
  }
  return target.animate(frames, { duration, easing: 'ease-out', fill: 'backwards' })
}

export class Animator {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Animation[] = []
  private nextIndex = 0
  private stepStartedAt = 0
  private remaining = 0
  private isPaused = false
  private destroyed = false

  constructor(
    private steps: AnimStep[],
    private opts: AnimatorOpts,
  ) {
    this.hideAll()
  }

  private hideAll(): void {
    for (const step of this.steps) for (const t of step) hide(t)
  }

  private stopTimers(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    for (const a of this.running) a.cancel()
    this.running = []
  }

  reset(): void {
    this.stopTimers()
    this.isPaused = false
    this.nextIndex = 0
    this.hideAll()
  }

  showAll(): void {
    this.stopTimers()
    this.isPaused = false
    this.nextIndex = this.steps.length
    for (const step of this.steps) for (const t of step) show(t)
  }

  play(): void {
    if (this.destroyed) return
    this.reset()
    this.runStep(0)
  }

  private runStep(i: number): void {
    if (i >= this.steps.length) {
      this.nextIndex = this.steps.length
      this.opts.onComplete?.()
      return
    }
    this.nextIndex = i + 1
    this.opts.onStepStart?.(i)
    this.running = []
    for (const t of this.steps[i]) {
      const a = animateTarget(t, this.opts.stepDuration)
      if (a) this.running.push(a)
    }
    const wait = this.opts.stepDuration + this.opts.stepDelay
    this.stepStartedAt = Date.now()
    this.remaining = wait
    this.timer = setTimeout(() => {
      this.timer = null
      this.runStep(i + 1)
    }, wait)
  }

  pause(): void {
    if (this.timer === null && this.running.length === 0) return
    if (this.isPaused) return
    this.isPaused = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
      this.remaining = Math.max(0, this.remaining - (Date.now() - this.stepStartedAt))
    }
    for (const a of this.running) a.pause()
  }

  resume(): void {
    if (!this.isPaused || this.destroyed) return
    this.isPaused = false
    for (const a of this.running) a.play()
    this.stepStartedAt = Date.now()
    this.timer = setTimeout(() => {
      this.timer = null
      this.runStep(this.nextIndex)
    }, this.remaining)
  }

  /** Show steps 0..n (inclusive) in their completed state; later steps hidden. */
  goToStep(n: number): void {
    this.stopTimers()
    this.isPaused = false
    this.hideAll()
    const upto = Math.min(n + 1, this.steps.length)
    for (let i = 0; i < upto; i++) for (const t of this.steps[i]) show(t)
    this.nextIndex = upto
  }

  destroy(): void {
    this.stopTimers()
    this.destroyed = true
  }
}
