import { Animator, type AnimStep } from './animator'
import type { DiagramController, ResolvedOptions } from './types'

export interface ClickTarget {
  el: SVGElement
  /** step index at which this element's node becomes visible */
  revealsAt: number
  /** step index its click reveals */
  expands: number
}

export function createDiagram(
  container: HTMLElement,
  svg: SVGSVGElement,
  steps: AnimStep[],
  opts: ResolvedOptions,
  stepIndexOffset = 0,
  clickTargets?: ClickTarget[],
): DiagramController {
  container.appendChild(svg)

  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = opts.animate && !reducedMotion
  // Reduced-motion / animate:false already show everything instantly — click
  // mode has nothing to add there, so it only engages alongside real animation.
  const clickMode = animate && opts.advance === 'click'

  const onStepStart = opts.onStepStart
  const anim = new Animator(steps, {
    stepDuration: opts.stepDuration,
    stepDelay: opts.stepDelay,
    onComplete: opts.onComplete,
    onStepStart: onStepStart
      ? (i) => {
          if (i - stepIndexOffset >= 0) onStepStart(i - stepIndexOffset)
        }
      : undefined,
  })

  // --- click-to-advance state (inert unless clickMode) ---
  const revealed = new Set<number>()
  const syncCursors = (): void => {
    if (!clickTargets) return
    for (const ct of clickTargets) {
      const clickable = revealed.has(ct.revealsAt) && !revealed.has(ct.expands)
      ct.el.style.cursor = clickable ? 'pointer' : ''
    }
  }
  const reveal = (i: number): void => {
    anim.revealStep(i)
    revealed.add(i)
    if (revealed.size === anim.stepCount) opts.onComplete?.()
    syncCursors()
  }
  const startClickMode = (): void => {
    anim.reset()
    revealed.clear()
    for (let i = 0; i < stepIndexOffset; i++) reveal(i) // intro
    if (stepIndexOffset === 0 && steps.length > 0) reveal(0) // flowchart: roots are step 0
  }
  const nextUnrevealed = (): number | null => {
    for (let i = 0; i < steps.length; i++) if (!revealed.has(i)) return i
    return null
  }

  const teardownClicks: (() => void)[] = []
  if (clickMode) {
    if (clickTargets) {
      // Flowchart: click a revealed node to expand its outgoing branches.
      for (const ct of clickTargets) {
        const handler = (): void => {
          if (revealed.has(ct.revealsAt) && !revealed.has(ct.expands)) reveal(ct.expands)
        }
        ct.el.addEventListener('click', handler)
        teardownClicks.push(() => ct.el.removeEventListener('click', handler))
      }
    } else {
      // Sequence/state: any click on the diagram advances one step.
      const handler = (): void => {
        const next = nextUnrevealed()
        if (next !== null) reveal(next)
      }
      svg.addEventListener('click', handler)
      teardownClicks.push(() => svg.removeEventListener('click', handler))
    }
  }

  const startOrPlay = (): void => {
    if (clickMode) startClickMode()
    else anim.play()
  }

  const start = (): void => {
    if (animate) startOrPlay()
    else anim.showAll()
  }

  let observer: IntersectionObserver | null = null
  if (!animate) {
    anim.showAll()
  } else if (opts.trigger === 'immediate') {
    startOrPlay()
  } else if (opts.trigger === 'onScroll') {
    if (typeof IntersectionObserver === 'undefined') {
      startOrPlay()
    } else {
      let played = false
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && (!played || opts.replayOnScroll)) {
              played = true
              startOrPlay()
            }
          }
        },
        { threshold: 0.2 },
      )
      observer.observe(svg)
    }
  }
  // trigger === 'manual': stays hidden until play()

  return {
    play: start,
    reset: () => {
      anim.reset()
      if (clickMode) {
        revealed.clear()
        syncCursors()
      }
    },
    pause: () => anim.pause(),
    resume: () => anim.resume(),
    goToStep: (n) => {
      anim.goToStep(n + stepIndexOffset)
      if (clickMode) {
        const upto = Math.max(0, Math.min(n + stepIndexOffset + 1, steps.length))
        revealed.clear()
        for (let i = 0; i < upto; i++) revealed.add(i)
        syncCursors()
      }
    },
    destroy: () => {
      observer?.disconnect()
      for (const off of teardownClicks) off()
      anim.destroy()
      svg.remove()
    },
  }
}
