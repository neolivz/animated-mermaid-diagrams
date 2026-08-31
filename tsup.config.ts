import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: { 'animated-mermaid-diagrams.umd': 'src/index.ts' },
    format: ['iife'],
    globalName: 'AnimatedMermaidDiagrams',
    minify: true,
    outExtension: () => ({ js: '.js' }),
  },
])
