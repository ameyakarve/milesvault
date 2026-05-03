#!/usr/bin/env node
// Copies the pre-compiled Tailwind v4 + Kumo standalone stylesheet from
// node_modules into public/kumo/standalone.css so the /kumo route subtree
// can load it via <link> without going through our v3 PostCSS pipeline.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'node_modules/@cloudflare/kumo/dist/styles/kumo-standalone.css')
const dst = resolve(root, 'public/kumo/standalone.css')

mkdirSync(dirname(dst), { recursive: true })
copyFileSync(src, dst)
console.log(`copied ${src} → ${dst}`)
