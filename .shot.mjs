import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } })
await p.goto('http://127.0.0.1:4173/.preview.html')
await p.waitForTimeout(500)
await p.screenshot({ path: process.argv[2], fullPage: true })
await b.close()
