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
  // The svg itself only carries slider semantics for the two cases where it is
  // the linear-step interactive surface: keyboard transport on an auto-mode
  // diagram, or click mode's svg-level (sequence/state) variant. Flowchart's
  // per-node click mode is non-linear — its svg stays role="img"; the nodes
  // themselves carry role="button" (see syncTargets).
  const sliderSvg = (clickMode && !clickTargets) || (!clickMode && opts.keyboard && animate)

  // --- click-to-advance state (inert unless clickMode) ---
  const revealed = new Set<number>()
  const userStepCount = steps.length - stepIndexOffset
  // Tracks whether the viewer has driven any reveal themselves (click, keyboard
  // advance, or an explicit goToStep). Only meaningful in click mode: it's what
  // lets an onScroll+replayOnScroll re-entry tell an untouched diagram (safe to
  // re-arm) from one with live progress (must be left alone). play()/reset()
  // clear it since those are deliberate restarts.
  let userInteracted = false

  // Assigned right below; referenced here only inside closures that run after
  // that assignment (the Animator's own onStepStart callback, keyboard
  // handlers), so the forward reference is safe.
  let anim: Animator
  const rawShown = (): number => (clickMode ? revealed.size : anim.position)
  /** Keeps aria-valuenow/valuetext in sync with "how many of the N user-facing
   *  steps are currently revealed" — a no-op unless this svg is a slider. */
  const syncAria = (): void => {
    if (!sliderSvg) return
    const current = Math.max(0, Math.min(rawShown() - stepIndexOffset, userStepCount))
    svg.setAttribute('aria-valuenow', String(current))
    svg.setAttribute('aria-valuetext', `step ${current} of ${userStepCount}`)
  }

  const onStepStart = opts.onStepStart
  anim = new Animator(steps, {
    stepDuration: opts.stepDuration,
    stepDelay: opts.stepDelay,
    onComplete: opts.onComplete,
    onStepStart: (i) => {
      syncAria()
      if (onStepStart && i - stepIndexOffset >= 0) onStepStart(i - stepIndexOffset)
    },
  })

  // Toggles cursor + keyboard-accessibility affordances (tabindex/role/aria-label)
  // on flowchart click targets as they become clickable/expanded. `deferStripFor`
  // holds off removing an element's own tabindex — used when that element still
  // has focus and the caller hasn't moved focus elsewhere yet (see
  // revealWithFocusHandoff below: stripping tabindex from a focused element
  // drops focus to <body>, so the caller does a two-pass sync around a focus()
  // call in between).
  const syncTargets = (deferStripFor?: SVGElement): void => {
    if (!clickTargets) return
    for (const ct of clickTargets) {
      const clickable = revealed.has(ct.revealsAt) && !revealed.has(ct.expands)
      ct.el.style.cursor = clickable ? 'pointer' : ''
      if (clickable) {
        ct.el.setAttribute('tabindex', '0')
        ct.el.setAttribute('role', 'button')
        const text = ct.el.querySelector('text')?.textContent
        ct.el.setAttribute('aria-label', text ? `Reveal next steps: ${text}` : 'Reveal next steps')
      } else if (ct.el !== deferStripFor) {
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
    syncAria()
  }
  /** The next clickable ClickTarget to focus after expanding `justExpanded`'s
   *  step: prefer one whose node the expansion just revealed, else any other
   *  currently-clickable target, else null (walk complete). */
  const findFocusCandidate = (justExpanded: number): ClickTarget | null => {
    if (!clickTargets) return null
    const clickableNow = clickTargets.filter(
      (t) => revealed.has(t.revealsAt) && !revealed.has(t.expands),
    )
    return clickableNow.find((t) => t.revealsAt === justExpanded) ?? clickableNow[0] ?? null
  }
  /** Keyboard-activated flowchart node expansion: reveals `target.expands`,
   *  then hands focus to the next clickable node (or the svg, once the walk
   *  is complete) BEFORE stripping the just-expanded node's own tabindex —
   *  removing tabindex from a still-focused element drops focus to <body>. */
  const revealWithFocusHandoff = (target: ClickTarget): void => {
    const i = target.expands
    anim.revealStep(i)
    revealed.add(i)
    const done = revealed.size === anim.stepCount
    // Pass 1: give newly-clickable candidates their tabindex so focus() below
    // actually lands somewhere focusable; defer stripping `target` itself.
    syncTargets(target.el)
    syncAria()
    const candidate = findFocusCandidate(i)
    if (candidate) candidate.el.focus()
    else svg.focus()
    // Pass 2: now safe to strip `target`'s tabindex — focus has moved on.
    syncTargets()
    if (done) opts.onComplete?.()
  }
  const startClickMode = (): void => {
    anim.reset()
    revealed.clear()
    for (let i = 0; i < stepIndexOffset; i++) reveal(i) // intro
    if (stepIndexOffset === 0 && steps.length > 0) reveal(0) // flowchart: roots are step 0
    syncAria()
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
      userInteracted = true
    }
    syncAria()
  }
  // Enter or Space activates a click target from the keyboard, same as a click
  // (Space also needs preventDefault so the page doesn't scroll).
  const isActivationKey = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' '

  const teardownListeners: (() => void)[] = []
  if (clickMode) {
    if (clickTargets) {
      // Flowchart: click (or Enter/Space when focused) a revealed node to
      // expand its outgoing branches. Non-linear reveal order — no arrow keys,
      // no slider role on the svg (see sliderSvg above); the svg itself only
      // gets a programmatic (tabindex="-1") focus target for when the walk
      // completes and there's no next node to hand focus to.
      svg.setAttribute('tabindex', '-1')
      for (const ct of clickTargets) {
        const clickable = (): boolean => revealed.has(ct.revealsAt) && !revealed.has(ct.expands)
        const onClick = (): void => {
          if (clickable()) {
            userInteracted = true
            reveal(ct.expands) // mouse: no focus stealing
          }
        }
        const onKeydown = (e: Event): void => {
          const ke = e as KeyboardEvent
          if (!isActivationKey(ke)) return
          if (ke.key === ' ') ke.preventDefault()
          if (clickable()) {
            userInteracted = true
            revealWithFocusHandoff(ct)
          }
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
      // back or restart — advances or rewinds one step at a time. Linear
      // reveal order, so the svg carries slider semantics (aria-valuenow is
      // the current step).
      const trigger = (): void => {
        userInteracted = true
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
      svg.setAttribute('role', 'slider')
      svg.setAttribute('aria-valuemin', '0')
      svg.setAttribute('aria-valuemax', String(userStepCount))
      // Left as-is once every step is revealed: the hint no longer matches
      // reality (Enter becomes a no-op), but removing it would mean toggling
      // aria-label on every reveal for a purely cosmetic gain — not worth it.
      svg.setAttribute('aria-label', `${svg.getAttribute('aria-label') ?? ''}. Press Enter to reveal the next step.`)
      syncAria()
    }
  } else if (opts.keyboard && animate) {
    // Keyboard transport for auto-mode diagrams (any trigger, including
    // 'manual' before play()): arrow keys step one anim-step at a time in raw
    // (un-offset) index space via anim.position, Space toggles play/pause,
    // Home/End jump to the start/end, Enter (re)starts playback. Linear
    // reveal order, so the svg carries slider semantics.
    const onKeydown = (e: Event): void => {
      const ke = e as KeyboardEvent
      switch (ke.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          ke.preventDefault()
          // Forward stepping animates (draw/fade in), matching click-to-advance;
          // backward/jump transport below stays instant since it can't meaningfully
          // animate. anim.stepForward()'s own onStepStart already syncs aria.
          anim.stepForward()
          syncAria()
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
          syncAria()
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
    svg.setAttribute('role', 'slider')
    svg.setAttribute('aria-valuemin', '0')
    svg.setAttribute('aria-valuemax', String(userStepCount))
    svg.setAttribute(
      'aria-label',
      `${svg.getAttribute('aria-label') ?? ''}: use arrow keys to step, Space to pause or resume, Home to reset.`,
    )
    syncAria()
  }

  const startOrPlay = (): void => {
    if (clickMode) startClickMode()
    else anim.play()
  }

  const start = (): void => {
    userInteracted = false
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
            // Click mode + replayOnScroll: only an untouched diagram re-arms on
            // re-entry — once the viewer has interacted, their progress must
            // survive scrolling away and back. Auto mode is unaffected: clickMode
            // is false there, so this collapses to the original `!played ||
            // opts.replayOnScroll`.
            const armable = !played || (opts.replayOnScroll && !(clickMode && userInteracted))
            if (e.isIntersecting && armable) {
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
      userInteracted = false
      syncAria()
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
