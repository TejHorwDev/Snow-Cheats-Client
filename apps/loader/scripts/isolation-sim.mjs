/**
 * One application, one identity.
 *
 * The loader ships from the same repository as the site and the panel, and it used
 * to ship beside a second Electron app as well. That app is gone, but the values
 * that kept the two apart are exactly the values a copy-paste inherits by accident:
 * an `appId`, a product name, a package name, a shortcut, an artifact name and a
 * release-train prefix. Two builds that match on any of them share a data folder, a
 * taskbar group, a single-instance lock or a set of releases.
 *
 * So this check is not documentation. It fails the release build if the loader ever
 * picks up a retired identity, and if the two files that define the identity —
 * `electron-builder.yml` for the installed app and `src/main/lib/identity.ts` for
 * the running one — ever disagree about what this app is called.
 *
 *   npm run sim:isolation
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (path) => readFileSync(path, 'utf8')
// Nested keys are indented, so leading whitespace is expected.
const yamlValue = (text, key) => {
  const match = text.match(new RegExp(`^[ \\t]*${key}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

let failures = 0

const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

/*
 * What this app must never be called again, and must not share with anything.
 *
 * The retired values are written down rather than referenced: the folder they came
 * from is not in this repository any more, and a check that reads its neighbour's
 * files stops checking the moment the neighbour is deleted.
 */
const RETIRED = {
  appId: 'com.indra.loader',
  productName: 'INDRA LOADER',
  packageName: 'indra-loader',
  shortcutName: 'INDRA LOADER',
  artifactName: 'INDRA-LOADER-Setup-${version}.${ext}',
  tagPrefix: 'v'
}

const builder = read(join(root, 'electron-builder.yml'))
const pkg = JSON.parse(read(join(root, 'package.json')))
const identity = read(join(root, 'src/main/lib/identity.ts'))
const updates = read(join(root, 'src/main/services/updates.ts'))

const appId = yamlValue(builder, 'appId')
const productName = yamlValue(builder, 'productName')
const shortcutName = yamlValue(builder, 'shortcutName')
const artifactName = yamlValue(builder, 'artifactName')

console.log('\nIdentity')
check('an appId is set', Boolean(appId) && appId !== RETIRED.appId, `${appId}`)
check('a product name is set', Boolean(productName) && productName !== RETIRED.productName, `${productName}`)
check('a package name is set', Boolean(pkg.name) && pkg.name !== RETIRED.packageName, `${pkg.name}`)
check(
  'a shortcut name is set',
  Boolean(shortcutName) && shortcutName !== RETIRED.shortcutName,
  `${shortcutName}`
)

console.log('\nInstaller')
check(
  'the installer names itself after this app',
  Boolean(artifactName) && artifactName !== RETIRED.artifactName && artifactName.includes('SNOW'),
  `${artifactName}`
)

console.log('\nWhat the running app thinks it is')
const runningName = identity.match(/APP_NAME = '([^']+)'/)?.[1] ?? null
const runningId = identity.match(/APP_ID = '([^']+)'/)?.[1] ?? null
/*
 * These two must agree with the installer. If they drift, the installed app writes
 * to a different %APPDATA% folder than the one its own update payload was staged
 * in, and updates stop applying for a reason nobody can see.
 */
check('the app name matches the installer', runningName === productName, `${runningName} ≠ ${productName}`)
check('the app id matches the installer', runningId === appId, `${runningId} ≠ ${appId}`)

console.log('\nUpdate train')
const tagPrefix = updates.match(/const TAG_PREFIX = '([^']+)'/)?.[1] ?? null
// A loader tag must start with a literal that no plain `v<version>` tag can
// produce, or the updater would offer a release that is not this app's.
check(
  'the tag prefix cannot match a plain version tag',
  typeof tagPrefix === 'string' && /^[a-z]/.test(tagPrefix) && tagPrefix !== RETIRED.tagPrefix,
  `${tagPrefix}`
)

console.log(
  failures === 0
    ? '\n✓ This build is one application with one identity.\n'
    : `\n✗ ${failures} identity problem(s).\n`
)
process.exitCode = failures === 0 ? 0 : 1
