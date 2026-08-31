import { Animator, type AnimStep } from './animator'
import type { DiagramController, ResolvedOptions } from './types'

export function createDiagram(
  container: HTMLElement,
  svg: SVGSVGElement,
  steps: AnimStep[],
  opts: ResolvedOptions,
  stepIndexOffset = 0,
): DiagramController {
  container.appendChild(svg)

  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = opts.animate && !reducedMotion

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

  const start = (): void => {
    if (animate) anim.play()
    else anim.showAll()
  }

  let observer: IntersectionObserver | null = null
  if (!animate) {
    anim.showAll()
  } else if (opts.trigger === 'immediate') {
    anim.play()
  } else if (opts.trigger === 'onScroll') {
    if (typeof IntersectionObserver === 'undefined') {
      anim.play()
    } else {
      let played = false
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && (!played || opts.replayOnScroll)) {
              played = true
              anim.play()
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
    reset: () => anim.reset(),
    pause: () => anim.pause(),
    resume: () => anim.resume(),
    goToStep: (n) => anim.goToStep(n + stepIndexOffset),
    destroy: () => {
      observer?.disconnect()
      anim.destroy()
      svg.remove()
    },
  }
}
