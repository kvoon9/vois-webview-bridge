#!/usr/bin/env node
/**
 * Blume docs build helper.
 *
 * Always builds in isolated mode so we never touch the project's real `dist/`
 * (used by the published library).
 *
 * Blume writes isolated builds to `.blume-verify/dist`. We copy that to
 * `docs/dist` for Cloudflare Pages.
 *
 * We also copy files from the root `public/` directory (e.g. _headers)
 * so that Cloudflare Pages static configuration works reliably
 * whether deploying via wrangler or Dashboard Git integration.
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const ISOLATED_DIST = '.blume-verify/dist'
const FINAL_DIST = join('docs', 'dist')
const PUBLIC_DIR = 'public'

console.log('🧹 Cleaning previous docs/dist...')
rmSync(FINAL_DIST, { recursive: true, force: true })
rmSync('.blume-verify', { recursive: true, force: true })

console.log('📦 Building docs with Blume (--isolated)...')

try {
  execSync('pnpm exec blume build --isolated', {
    stdio: 'inherit',
    cwd: ROOT,
  })
} catch (e) {
  // blume build can exit non-zero on warnings in some cases; continue if output exists
}

if (!existsSync(ISOLATED_DIST)) {
  console.error('❌ Expected isolated build output not found at', ISOLATED_DIST)
  process.exit(1)
}

console.log(`📁 Moving ${ISOLATED_DIST} → ${FINAL_DIST}...`)
mkdirSync('docs', { recursive: true })
cpSync(ISOLATED_DIST, FINAL_DIST, { recursive: true })

// Copy static assets from root public/ (e.g. _headers for Cloudflare Pages)
if (existsSync(PUBLIC_DIR)) {
  console.log(`📄 Copying static files from ${PUBLIC_DIR}/ → ${FINAL_DIST}/`)
  for (const entry of readdirSync(PUBLIC_DIR)) {
    const src = join(PUBLIC_DIR, entry)
    const dest = join(FINAL_DIST, entry)
    if (statSync(src).isDirectory()) {
      cpSync(src, dest, { recursive: true })
    } else {
      cpSync(src, dest)
    }
  }
}

// Clean temp isolated dir
rmSync('.blume-verify', { recursive: true, force: true })

console.log('✅ Docs site ready at', FINAL_DIST)

// Maintain the llm.md alias some old references expect
const llmsFull = join(FINAL_DIST, 'llms-full.txt')
const llmAlias = join(FINAL_DIST, 'llm.md')
if (existsSync(llmsFull)) {
  cpSync(llmsFull, llmAlias)
  console.log('📄 Wrote llm.md (alias for llms-full.txt)')
}

console.log('🎉 docs:build complete.')
