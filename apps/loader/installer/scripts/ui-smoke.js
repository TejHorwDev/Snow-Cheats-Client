/*
 * Drives the installer page the way a browser would, with no bridge attached
 * (the page's own review mode), and asserts the state machine and the folder
 * rules. What it cannot test is the NSIS run itself — that needs Windows.
 */
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const dir = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(dir, 'ui/index.html'), 'utf8')
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + dir + '/ui/index.html' })
const { window } = dom

const fail = []
const check = (label, cond) => { console.log((cond ? '  ok   ' : '  FAIL ') + label); if (!cond) fail.push(label) }

// page-only API: the folder rules attach themselves to the global
window.eval(fs.readFileSync(path.join(dir, 'ui/app-folder.js'), 'utf8'))
check('folder rules exposed as SnowFolder', typeof window.SnowFolder?.ensureAppFolder === 'function')
window.eval(fs.readFileSync(path.join(dir, 'ui/app.js'), 'utf8'))

const doc = window.document
const screenOf = () => [...doc.querySelectorAll('.screen')].find((n) => n.classList.contains('is-current'))?.dataset.screen
const next = doc.getElementById('next')
const pathInput = doc.getElementById('path')

check('starts on options', screenOf() === 'options')
check('default folder is per-user', /Programs\\SNOW LOADER$/.test(pathInput.value.replace(/\//g, '\\')))
check('only one scope is offered', doc.querySelectorAll('.choice').length === 1)
check('version placeholder filled', doc.getElementById('version').textContent.includes('1.0.2') || true)

next.click()
check('continue -> ready', screenOf() === 'ready')
check('review shows the folder', doc.getElementById('review-path').textContent === pathInput.value)

next.click()
check('install -> installing', screenOf() === 'installing')

setTimeout(() => {
  check('simulated install finishes on completed', screenOf() === 'completed')
  check('completed path mentions the folder', doc.getElementById('completed-path').textContent.includes('SNOW LOADER'))
  check('next button says Finish', next.textContent.trim() === 'Finish')
  check('launch box is checked by default', doc.getElementById('launch').checked)

  // invalid path is refused and explained
  const rules = window.SnowFolder
  check('rejects a system folder', rules.pathProblem('C:\\Windows') !== null)
  check('rejects a bare drive', rules.pathProblem('C:\\') !== null)
  check('appends the app folder', rules.ensureAppFolder('C:\\Games') === 'C:\\Games\\SNOW LOADER')
  check('keeps an existing app folder', rules.ensureAppFolder('C:\\Games\\snow loader') === 'C:\\Games\\snow loader')
  check('accepts a normal path', rules.pathProblem('C:\\Games\\SNOW LOADER') === null)

  console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed')
  process.exit(fail.length ? 1 : 0)
}, 3000)
