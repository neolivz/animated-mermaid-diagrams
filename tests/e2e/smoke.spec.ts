import { test, expect, type Page } from '@playwright/test'

// Cross-engine smoke suite against the real demo page. Targets the surfaces
// where browser engines genuinely diverge: WAAPI on SVG presentation
// attributes, SVG element focus, ARIA slider semantics, and media emulation.

const DEMO = '/demo/index.html'

const visibleTexts = (page: Page, scope: string): Promise<string[]> =>
  page.evaluate((sel) => {
    const svg = document.querySelector(`${sel} svg`)
    if (!svg) return []
    const hidden = (n: Element): boolean => {
      for (let e: Element | null = n; e && e.tagName !== 'svg'; e = e.parentElement) {
        const st = (e as SVGElement).style
        if (st && (st.opacity === '0' || (st.strokeDashoffset && st.strokeDashoffset !== '0' && st.strokeDashoffset !== ''))) return true
      }
      return false
    }
    return [...svg.querySelectorAll('text')].filter((t) => !hidden(t)).map((t) => t.textContent ?? '')
  }, scope)

test('all figures render without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(DEMO)
  await expect(page.locator('svg')).toHaveCount(13)
  expect(errors).toEqual([])
})

test('journey and timeline figures play to completion on scroll', async ({ page }) => {
  await page.goto(DEMO)
  await page.locator('#fig-09').scrollIntoViewIfNeeded()
  await expect.poll(() => visibleTexts(page, '#fig-09'), { timeout: 15000 }).toContain('Sit down')
  await page.locator('#fig-10').scrollIntoViewIfNeeded()
  await expect.poll(() => visibleTexts(page, '#fig-10'), { timeout: 15000 }).toContain('Twitch')
})

test('class and er figures play to completion on scroll', async ({ page }) => {
  await page.goto(DEMO)
  await page.locator('#fig-11').scrollIntoViewIfNeeded()
  await expect.poll(() => visibleTexts(page, '#fig-11'), { timeout: 20000 }).toContain('Category')
  await page.locator('#fig-12').scrollIntoViewIfNeeded()
  await expect.poll(() => visibleTexts(page, '#fig-12'), { timeout: 15000 }).toContain('LINE_ITEM')
})

test('scroll-triggered playback drives real WAAPI animations to completion', async ({ page }) => {
  await page.goto(DEMO)
  await page.locator('#fig-01').scrollIntoViewIfNeeded()
  // Animations must actually run (not snap): sample getAnimations while playing.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 5000 })
    .toBeGreaterThan(0)
  // And the diagram must finish fully revealed.
  await expect.poll(() => visibleTexts(page, '#fig-01'), { timeout: 15000 }).toContain('Delete immediately')
})

test('click-to-explore expands a branch per click', async ({ page }) => {
  await page.goto(DEMO)
  await page.locator('#fig-04').scrollIntoViewIfNeeded()
  const start = page.locator('#fig-04 svg g[role="button"]', { hasText: 'Start' })
  await expect(start).toBeVisible()
  await start.click()
  await expect.poll(() => visibleTexts(page, '#fig-04'), { timeout: 5000 }).toContain('Validate')
})

test('keyboard transport: arrows step, slider ARIA tracks, Space plays to the end', async ({ page }) => {
  await page.goto(DEMO)
  const svg = page.locator('#fig-03 svg')
  await svg.evaluate((el) => (el as unknown as HTMLElement).focus())
  await expect(svg).toBeFocused()
  await expect(svg).toHaveRole('slider')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(svg).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press(' ')
  await expect(svg).toHaveAttribute('aria-valuenow', '5', { timeout: 15000 })
})

test('keyboard node walking with Enter reveals and hands focus onward', async ({ page }) => {
  await page.goto(DEMO)
  await page.locator('#fig-04').scrollIntoViewIfNeeded()
  const start = page.locator('#fig-04 svg g[role="button"]', { hasText: 'Start' })
  await start.evaluate((el) => (el as unknown as HTMLElement).focus())
  await page.keyboard.press('Enter')
  await expect.poll(() => visibleTexts(page, '#fig-04'), { timeout: 5000 }).toContain('Validate')
  // focus moved to the next walkable node
  const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '')
  expect(focusedText).toContain('Validate')
})

test('prefers-reduced-motion renders final state instantly', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(DEMO)
  // No scrolling, no waiting for animation: content must already be revealed.
  const texts = await visibleTexts(page, '#fig-01')
  expect(texts).toContain('Delete immediately')
  // Transport is inert under reduced motion: no slider role.
  await expect(page.locator('#fig-03 svg')).toHaveRole('img')
  await ctx.close()
})

test('dark color scheme applies the dark theme tokens', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.goto(DEMO)
  const bg = await page.evaluate(
    () => document.querySelector('#fig-02 svg rect')?.getAttribute('fill'),
  )
  expect(bg).toBe('#0f172a')
  await ctx.close()
})
