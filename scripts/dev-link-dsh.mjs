#!/usr/bin/env node
/**
 * Make a local ("link:") install of this checkout importable.
 *
 * The DSH Plugin Manager installs an absolute local path with pnpm's `link:`
 * protocol. pnpm does not resolve a linked package's own dependencies or peer
 * dependencies from the target's node_modules, so the Loader fails with a bare
 * import error even though the bundle is listed and enabled. A published or
 * tarball install does not have this problem.
 *
 * This script symlinks the packages this plugin imports from the running DSH
 * installation into `./node_modules`. It only touches the gitignored
 * `node_modules/` and never the DSH installation.
 *
 * Usage:
 *   node scripts/dev-link-dsh.mjs [path-to-@deepseek-ai/dsh-package]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

/**
 * @param {string} dir - candidate DSH package directory.
 * @returns {boolean} whether it is the DSH package.
 */
function isDshPackage(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))?.name === '@deepseek-ai/dsh'
  } catch {
    return false
  }
}

/**
 * @param {string} file - executable path.
 * @returns {string | undefined} resolved DSH package directory.
 */
function fromExecutable(file) {
  if (!file || !existsSync(file)) return undefined
  let real
  try {
    real = realpathSync(file)
  } catch {
    return undefined
  }
  const candidate = dirname(dirname(real))
  return isDshPackage(candidate) ? candidate : undefined
}

/**
 * @returns {string | undefined} DSH package directory found on PATH.
 */
function findOnPath() {
  try {
    const output = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['dsh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const line of output.split(/\r?\n/)) {
      const found = fromExecutable(line.trim())
      if (found) return found
    }
  } catch {
    /* not on PATH */
  }
  return undefined
}

const dshRoot =
  (process.argv[2] && resolve(process.argv[2])) ||
  process.env.DSH_PACKAGE_DIR ||
  findOnPath() ||
  '/opt/node-v24.22.0-linux-x64/lib/node_modules/@deepseek-ai/dsh'

if (!isDshPackage(dshRoot)) {
  console.error(`dev-link: "${dshRoot}" is not a DSH package. Pass the @deepseek-ai/dsh directory as an argument.`)
  process.exit(1)
}

const modules = [
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.dependencies ?? {}),
]
const targetRoot = join(dshRoot, 'node_modules')
mkdirSync(join(repoRoot, 'node_modules'), { recursive: true })

let linked = 0
for (const name of modules) {
  const source = join(targetRoot, name)
  const link = join(repoRoot, 'node_modules', name)
  if (!existsSync(source)) {
    console.warn(`dev-link: ${name} is not installed in ${targetRoot}; skipped`)
    continue
  }
  mkdirSync(dirname(link), { recursive: true })
  if (existsSync(link) || isSymlink(link)) {
    const stat = lstatSync(link)
    if (!stat.isSymbolicLink()) {
      console.log(`dev-link: ${name} already exists as a real directory; skipped`)
      continue
    }
    rmSync(link, { force: true })
  }
  symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir')
  linked += 1
}

console.log(`dev-link: linked ${linked}/${modules.length} package(s) from ${dshRoot}`)
console.log('dev-link: reload the plugin or restart the Host if it is already mounted')

/**
 * @param {string} path - candidate path.
 * @returns {boolean} whether the path is a symlink.
 */
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}
