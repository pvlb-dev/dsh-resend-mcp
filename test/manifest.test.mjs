import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

test('package identifies the bundle and its patch', () => {
  assert.equal(manifest.name, 'dsh-resend-mcp')
  assert.match(manifest.version, /^\d+\.\d+\.\d+/)
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports['.'], './lib/index.js')
  assert.equal(manifest.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
})

test('compatibility and peers target the current DSH line', () => {
  assert.match(manifest.dsh.compatibility.dsh, />=0\.2\.0-rc\.1 <0\.3\.0-0/)
  for (const peer of [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-mcp-client',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/schemastery',
  ]) {
    assert.ok(manifest.peerDependencies[peer], `missing peer ${peer}`)
  }
  assert.equal(manifest.dependencies['@modelcontextprotocol/client'], '2.0.0')
})

test('publish artifact files include the runtime bundle', () => {
  for (const entry of ['lib/', 'locale/', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE']) {
    assert.ok(manifest.files.includes(entry), `files is missing ${entry}`)
  }
  assert.ok(existsSync(join(root, 'lib/index.js')))
  assert.ok(existsSync(join(root, 'icon.svg')))
  assert.ok(existsSync(join(root, 'locale/en.json')))
})

test('cordis patch inserts the expected row', () => {
  assert.match(patch, /- insert:/)
  assert.match(patch, /id: dsh-resend-mcp/)
  assert.match(patch, /name: dsh-resend-mcp/)
  assert.match(patch, /config: \{\}/)
})

test('display metadata is valid JSON with title and description', () => {
  const locale = JSON.parse(readFileSync(join(root, 'locale/en.json'), 'utf8'))
  assert.equal(typeof locale.meta.title, 'string')
  assert.equal(typeof locale.meta.description, 'string')
  assert.ok(locale.meta.title.length > 0)
  assert.ok(locale.meta.description.length > 0)
})

test('scripts are wired for tests, checks, dev-link, and smoke', () => {
  assert.match(manifest.scripts.test, /node --test/)
  assert.match(manifest.scripts.check, /node --check lib\/index\.js/)
  assert.match(manifest.scripts['dev:link'], /dev-link-dsh\.mjs/)
  assert.match(manifest.scripts.smoke, /smoke\.mjs/)
})
