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
  // Shared by the public goToStep() and the keyboard-transport/click-mode
  // ArrowLeft handling below: applies a raw (un-offset) anim-step index and,
  // in click mode, keeps the `revealed` bookkeeping (and its cursor/aria
  // affordances) in lockstep with wherever the Animator landed.
  const applyRawGoToStep = (raw: number): void => {
    anim.goToStep(raw)
    if (clickMode) {
      const upto = Math.max(0, Math.min(raw + 1, steps.length))
      revealed.clear()
      for (let i = 0; i < upto; i++) revealed.add(i)
      syncTargets()
    }
  }
  // Enter or Space activates a click target from the keyboard, same as a click
  // (Space also needs preventDefault so the page doesn't scroll).
  const isActivationKey = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' '

  const teardownListeners: (() => void)[] = []
  if (clickMode) {
    if (clickTargets) {
      // Flowchart: click (or Enter/Space when focused) a revealed node to
      // expand its outgoing branches. Non-linear reveal order — no arrow keys.
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
        teardownListeners.push(() => {
          ct.el.removeEventListener('click', onClick)
          ct.el.removeEventListener('keydown', onKeydown)
        })
      }
    } else {
      // Sequence/state: any click on the diagram — or, when the svg is
      // focused, Enter/Space/ArrowRight to advance and ArrowLeft/Home to step
      // back or restart — advances or rewinds one step at a time.
      const trigger = (): void => {
        const next = nextUnrevealed()
        if (next !== null) reveal(next)
      }
      const onClick = (): void => trigger()
      const onKeydown = (e: Event): void => {
        const ke = e as KeyboardEvent
        if (isActivationKey(ke) || ke.key === 'ArrowRight') {
          if (ke.key === ' ') ke.preventDefault()
          else if (ke.key === 'ArrowRight') ke.preventDefault()
          trigger()
          return
        }
        if (ke.key === 'ArrowLeft') {
          ke.preventDefault()
          applyRawGoToStep(revealed.size - 2)
          return
        }
        if (ke.key === 'Home') {
          ke.preventDefault()
          startClickMode()
        }
      }
      svg.addEventListener('click', onClick)
      svg.addEventListener('keydown', onKeydown)
      teardownListeners.push(() => {
        svg.removeEventListener('click', onClick)
        svg.removeEventListener('keydown', onKeydown)
      })
      svg.setAttribute('tabindex', '0')
      // Left as-is once every step is revealed: the hint no longer matches
      // reality (Enter becomes a no-op), but removing it would mean toggling
      // aria-label on every reveal for a purely cosmetic gain — not worth it.
      svg.setAttribute('aria-label', `${svg.getAttribute('aria-label') ?? ''}. Press Enter to reveal the next step.`)
    }
  } else if (opts.keyboard && animate) {
    // Keyboard transport for auto-mode diagrams (any trigger, including
    // 'manual' before play()): arrow keys step one anim-step at a time in raw
    // (un-offset) index space via anim.position, Space toggles play/pause,
    // Home/End jump to the start/end, Enter (re)starts playback.
    const onKeydown = (e: Event): void => {
      const ke = e as KeyboardEvent
      switch (ke.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          ke.preventDefault()
          applyRawGoToStep(anim.position)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          ke.preventDefault()
          applyRawGoToStep(anim.position - 2)
          break
        case ' ':
          ke.preventDefault()
          if (anim.paused) anim.resume()
          else if (anim.playing) anim.pause()
          else anim.play()
          break
        case 'Home':
          ke.preventDefault()
          anim.reset()
          break
        case 'End':
          ke.preventDefault()
          applyRawGoToStep(anim.stepCount - 1)
          break
        case 'Enter':
          ke.preventDefault()
          anim.play()
          break
        default:
          return
      }
    }
    svg.addEventListener('keydown', onKeydown)
    teardownListeners.push(() => svg.removeEventListener('keydown', onKeydown))
    svg.setAttribute('tabindex', '0')
    svg.setAttribute(
      'aria-label',
      `${svg.getAttribute('aria-label') ?? ''}: use arrow keys to step, Space to pause or resume, Home to reset.`,
    )
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
    // In click mode, steps advance only via user clicks/keydowns (see reveal()
    // above) — a stray resume() must not silently start timed auto-playback.
    resume: () => {
      if (!clickMode) anim.resume()
    },
    goToStep: (n) => applyRawGoToStep(n + stepIndexOffset),
    destroy: () => {
      observer?.disconnect()
      for (const off of teardownListeners) off()
      anim.destroy()
      svg.remove()
    },
  }
}
