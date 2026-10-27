#!/usr/bin/env node
// Builds the Forgejo release payload for a version from CHANGELOG.md.
//
//   node scripts/release-notes.mjs 0.8.4            # JSON for POST /releases
//   node scripts/release-notes.mjs 0.8.4 --body     # notes only (dry run)
//
// The release name is `v<version> — <first heading of the changelog section>`
// and the body is the changelog section plus an install snippet and the home
// links, so a release page is readable without opening the repository.
// A version without a changelog section still produces a valid release: the
// notes fall back to a one-liner instead of failing the workflow.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOME_URL = 'https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp'
export const NPM_URL = 'https://www.npmjs.com/package/dsh-resend-mcp'
export const PACKAGE_NAME = 'dsh-resend-mcp'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pulls one `## [<version>] - <date>` section out of a changelog.
 * Returns `null` when the version has no section.
 */
export function extractRelease(markdown, version) {
  if (typeof markdown !== 'string' || typeof version !== 'string' || version === '') {
    return null
  }
  const lines = markdown.split(/\r?\n/)
  const heading = new RegExp(
    `^## \\[${escapeRegExp(version)}\\](?:\\s*[-–]\\s*(\\d{4}-\\d{2}-\\d{2}))?\\s*$`,
  )
  const sectionStart = lines.findIndex((line) => heading.test(line))
  if (sectionStart === -1) return null

  const date = lines[sectionStart].match(heading)?.[1] ?? null
  let sectionEnd = lines.length
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      sectionEnd = index
      break
    }
  }

  const section = lines.slice(sectionStart + 1, sectionEnd).join('\n').trim()
  let title = null
  let body = section
  const firstHeading = section.match(/^###\s+(.+)$/m)
  if (firstHeading) {
    title = firstHeading[1].trim()
    // The name carries the heading; keep the rest of the notes free of it.
    body = section
      .replace(/^###\s+(.+)\s*\n?/m, '')
      .replace(/^\n+/, '')
      .trim()
  }

  return { version, date, title, body, found: true }
}

function installSection(version) {
  return [
    '### Install',
    '',
    '```bash',
    `dsh plugin --profile web add ${PACKAGE_NAME}`,
    '```',
    '',
    `Home: ${HOME_URL}`,
    `npm: ${NPM_URL}`,
  ].join('\n')
}

/**
 * Turns a changelog into the JSON body `POST /repos/{owner}/{repo}/releases`
 * expects. `prerelease` follows the semver pre-release marker.
 */
export function buildRelease(changelog, version) {
  const parsed = extractRelease(changelog, version)
  const notes = parsed?.body?.trim()
    ? parsed.body.trim()
    : `Fork release of ${PACKAGE_NAME} ${version}. See CHANGELOG.md for the details.`
  const title = parsed?.title ? `${version} — ${parsed.title}` : version

  return {
    tag_name: `v${version}`,
    name: `v${title}`,
    body: `${notes}\n\n${installSection(version)}\n`,
    draft: false,
    prerelease: version.includes('-'),
  }
}

function main(argv) {
  const version = argv.find((arg) => !arg.startsWith('--'))
  const bodyOnly = argv.includes('--body')
  if (!version) {
    console.error('usage: node scripts/release-notes.mjs <version> [--body]')
    return 2
  }
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const release = buildRelease(changelog, version)
  process.stdout.write(bodyOnly ? `${release.body}` : `${JSON.stringify(release, null, 2)}\n`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
