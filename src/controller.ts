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
  // Toggles cursor + keyboard-accessibility affordances (tabindex/role/aria-label)
  // on flowchart click targets as they become clickable/expanded.
  const syncTargets = (): void => {
    if (!clickTargets) return
    for (const ct of clickTargets) {
      const clickable = revealed.has(ct.revealsAt) && !revealed.has(ct.expands)
      ct.el.style.cursor = clickable ? 'pointer' : ''
      if (clickable) {
        ct.el.setAttribute('tabindex', '0')
        ct.el.setAttribute('role', 'button')
        const text = ct.el.querySelector('text')?.textContent
        ct.el.setAttribute('aria-label', text ? `Reveal next steps: ${text}` : 'Reveal next steps')
      } else {
        ct.el.removeAttribute('tabindex')
        ct.el.removeAttribute('role')
        ct.el.removeAttribute('aria-label')
      }
    }
  }
  const reveal = (i: number): void => {
    anim.revealStep(i)
    revealed.add(i)
    if (revealed.size === anim.stepCount) opts.onComplete?.()
    syncTargets()
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
  // Enter or Space activates a click target from the keyboard, same as a click
  // (Space also needs preventDefault so the page doesn't scroll).
  const isActivationKey = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' '

  const teardownClicks: (() => void)[] = []
  if (clickMode) {
    if (clickTargets) {
      // Flowchart: click (or Enter/Space when focused) a revealed node to
      // expand its outgoing branches.
      for (const ct of clickTargets) {
        const trigger = (): void => {
          if (revealed.has(ct.revealsAt) && !revealed.has(ct.expands)) reveal(ct.expands)
        }
        const onClick = (): void => trigger()
        const onKeydown = (e: Event): void => {
          const ke = e as KeyboardEvent
          if (!isActivationKey(ke)) return
          if (ke.key === ' ') ke.preventDefault()
          trigger()
        }
        ct.el.addEventListener('click', onClick)
        ct.el.addEventListener('keydown', onKeydown)
        teardownClicks.push(() => {
          ct.el.removeEventListener('click', onClick)
          ct.el.removeEventListener('keydown', onKeydown)
        })
      }
    } else {
      // Sequence/state: any click on the diagram — or Enter/Space when the
      // svg is focused — advances one step.
      const trigger = (): void => {
        const next = nextUnrevealed()
        if (next !== null) reveal(next)
      }
      const onClick = (): void => trigger()
      const onKeydown = (e: Event): void => {
        const ke = e as KeyboardEvent
        if (!isActivationKey(ke)) return
        if (ke.key === ' ') ke.preventDefault()
        trigger()
      }
      svg.addEventListener('click', onClick)
      svg.addEventListener('keydown', onKeydown)
      teardownClicks.push(() => {
        svg.removeEventListener('click', onClick)
        svg.removeEventListener('keydown', onKeydown)
      })
      svg.setAttribute('tabindex', '0')
      // Left as-is once every step is revealed: the hint no longer matches
      // reality (Enter becomes a no-op), but removing it would mean toggling
      // aria-label on every reveal for a purely cosmetic gain — not worth it.
      svg.setAttribute('aria-label', `${svg.getAttribute('aria-label') ?? ''}. Press Enter to reveal the next step.`)
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
        syncTargets()
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
        syncTargets()
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
