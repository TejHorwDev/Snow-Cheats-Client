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

    // A process that failed to spawn reports it asynchronously.
    child.on('error', (error) => {
      console.error('[launch] could not start', entry.exe, error)
      running.delete(id)
    })

    /*
     * Wait a moment before saying "Launched".
     *
     * A file Windows refuses — blocked, half-downloaded, a missing DLL, a cancelled
     * elevation prompt — exits immediately, and the old code had already returned
     * success by then: the card said "Launching" and nothing opened. Anything that dies
     * within this window is reported as the failure it is, with its exit code.
     */
    const early = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), EARLY_EXIT_MS)
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code ?? 0)
      })
    })

    if (early !== null && early !== 0) {
      running.delete(id)
      console.error('[launch] exited immediately', entry.exe, early)
      return {
        ok: false,
        error: `Windows closed it straight away (code ${early}). Try running it once from its folder.`
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
