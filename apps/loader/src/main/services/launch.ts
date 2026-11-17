import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { installed } from './installed'

/*
 * Starting an application.
 *
 * Detached, with no stdio and no shell: the loader is a launcher, not a
 * supervisor, so closing it must not close what it started and nothing from a
 * product's name or path is ever handed to a command interpreter.
 *
 * Launch is only ever explicit — a click. There is no auto-run, no "open on
 * start", and nothing is executed because it finished downloading.
 */

const running = new Map<string, number>()

export interface LaunchResult {
  ok: boolean
  error?: string
}

const EARLY_EXIT_MS = 1_400

/** Windows' own number for "this program requires elevation". */
const ELEVATION_REQUIRED = 740

/**
 * Did Windows refuse to start it because the program wants administrator rights?
 *
 * Node reports it three ways depending on the build: `EACCES`, `EPERM`, or the raw
 * Windows code 740 in the message. A cheat almost always asks for elevation, so this
 * is the common case, not the exotic one — and it used to look exactly like a launch
 * that worked, because the error arrived after the answer had already been given.
 */
function needsElevation(error: unknown): boolean {
  const failure = error as NodeJS.ErrnoException & { errno?: number }
  if (!failure) return false
  if (failure.code === 'EACCES' || failure.code === 'EPERM') return true
  if (failure.errno === ELEVATION_REQUIRED) return true
  return /elevation|administrator|740|access is denied/i.test(String(failure.message ?? ''))
}

/*
 * Start it through the shell's own "run as administrator", which is the only way to
 * raise the consent prompt from an unelevated process.
 *
 * Start-Process -PassThru prints the process id, so the card can still say "Running"
 * honestly. If the person cancels the prompt, PowerShell exits non-zero and that is
 * reported as the cancellation it is — not as a launch.
 */
function elevated(exe: string): Promise<{ ok: boolean; pid?: number; error?: string }> {
  return new Promise((resolve) => {
    const script = [
      '$ErrorActionPreference = "Stop"',
      `$p = Start-Process -FilePath '${exe.replace(/'/g, "''")}' ` +
        `-WorkingDirectory '${dirname(exe).replace(/'/g, "''")}' -Verb RunAs -PassThru`,
      'Write-Output $p.Id'
    ].join('; ')

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )

    let out = ''
    let err = ''
    child.stdout?.on('data', (chunk) => (out += String(chunk)))
    child.stderr?.on('data', (chunk) => (err += String(chunk)))

    child.on('error', (error) => {
      console.error('[launch] elevation could not run', error)
      resolve({ ok: false, error: 'Windows would not open the administrator prompt.' })
    })

    child.on('exit', (code) => {
      const pid = Number.parseInt(out.trim(), 10)
      if (code === 0 && Number.isFinite(pid) && pid > 0) return resolve({ ok: true, pid })
      console.error('[launch] elevation declined', code, err.trim().slice(0, 200))
      resolve({ ok: false, error: 'Administrator permission was cancelled.' })
    })
  })
}

export async function launch(id: string): Promise<LaunchResult> {
  const entry = installed(id)
  if (!entry) return { ok: false, error: 'That application is not installed on this machine.' }
  if (!existsSync(entry.exe)) return { ok: false, error: 'The file is missing. Download it again.' }

  try {
    const child = spawn(entry.exe, [], {
      cwd: dirname(entry.exe),
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })

    /*
     * Wait a moment before saying "Launched", and watch both ways it can fail.
     *
     * `spawn` answers with a handle immediately; the truth arrives later as either an
     * `error` (the file was never started) or an `exit` (it started and died). The old
     * code listened for neither before returning success, which is why the toast said
     * "Launching" and nothing ever opened.
     */
    const outcome = await new Promise<{ error?: unknown; code?: number } | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), EARLY_EXIT_MS)
      child.once('error', (error) => {
        clearTimeout(timer)
        resolve({ error })
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve({ code: code ?? 0 })
      })
    })

    /* Wanted administrator rights: raise the prompt and start it that way. */
    if (outcome && outcome.error !== undefined && needsElevation(outcome.error)) {
      const raised = await elevated(entry.exe)
      if (!raised.ok) {
        running.delete(id)
        return { ok: false, error: raised.error }
      }

      if (raised.pid) {
        running.set(id, raised.pid)
        watch(id, raised.pid)
      }
      return { ok: true }
    }

    if (outcome && outcome.error !== undefined) {
      running.delete(id)
      const failure = outcome.error as NodeJS.ErrnoException
      console.error('[launch] could not start', entry.exe, failure)
      const code = failure.errno ?? failure.code ?? 'unknown'
      return {
        ok: false,
        error: `Windows would not start it (${code}). If your antivirus removed it, download it again.`
      }
    }

    if (outcome && outcome.code !== undefined && outcome.code !== 0) {
      running.delete(id)
      console.error('[launch] exited immediately', entry.exe, outcome.code)
      return {
        ok: false,
        error: `Windows closed it straight away (code ${outcome.code}). Try running it once from its folder.`
      }
    }

    child.unref()
    if (typeof child.pid === 'number') {
      running.set(id, child.pid)
      watch(id, child.pid)
    }

    return { ok: true }
  } catch (error) {
    console.error('[launch] failed', error)
    return { ok: false, error: 'Windows refused to start that file.' }
  }
}

/**
 * Notices when the process exits, so the card can say "Running" honestly and go
 * back to "Launch" when it closes.
 *
 * `process.kill(pid, 0)` is the portable liveness probe: it throws once the pid
 * is gone. It is polled rather than watched because a detached process leaves no
 * handle to close.
 */
function watch(id: string, pid: number): void {
  const timer = setInterval(() => {
    try {
      process.kill(pid, 0)
    } catch {
      running.delete(id)
      clearInterval(timer)
    }
  }, 3_000)

  timer.unref()
}

export function isRunning(id: string): boolean {
  const pid = running.get(id)
  if (pid === undefined) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    running.delete(id)
    return false
  }
}
