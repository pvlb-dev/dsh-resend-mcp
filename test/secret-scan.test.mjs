import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const skipDirs = new Set(['.git', 'node_modules', '.worktrees', 'coverage'])
const skipFiles = new Set(['package-lock.json', 'pnpm-lock.yaml'])
const API_KEY_PATTERN = /\bre_[A-Za-z0-9]{20,}\b/g

/**
 * @param {string} dir - directory to walk.
 * @returns {string[]} file paths relative to the repo root.
 */
function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue
    const absolute = join(dir, entry)
    const stat = statSync(absolute)
    if (stat.isDirectory()) files.push(...walk(absolute))
    else if (!skipFiles.has(entry)) files.push(absolute)
  }
  return files
}

test('tracked text files contain no Resend API keys', () => {
  const offenders = []
  for (const file of walk(root)) {
    if (statSync(file).size > 2_000_000) continue
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) continue
    const matches = text.match(API_KEY_PATTERN)
    if (matches) offenders.push(`${relative(root, file)}: ${matches.length} match(es)`)
  }
  assert.deepEqual(offenders, [])
})
