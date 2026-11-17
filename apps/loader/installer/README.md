# SNOW LOADER — installer window

This is the `.exe` people download. It is not an NSIS wizard: it is a small
Electron app with its own page, and it runs the real NSIS installer **silently**
behind that page.

## Why

electron-builder's assisted NSIS installer draws its first page from strings
resolved at run time. On some Windows machines they resolve to empty strings, so
the wizard appears with blank radio labels and blank Next/Cancel buttons — a
dead end with no words on it. That happened here at 1.0.0 and again at 1.0.1
after the offending page was removed, so the wizard was taken out of the user's
path entirely.

## How it works

```
SNOW-LOADER-Installer-<version>.exe   (this app, portable electron-builder build)
  resources/loader-setup.exe          the stock NSIS installer, embedded
        │
        └─ spawned as:  loader-setup.exe /S /currentuser /D=<chosen folder>
```

The window asks for a folder, spawns the installer with `windowsVerbatimArguments`
(`/D=` must not be quoted), and polls the size of the target folder to drive the
progress bar — NSIS prints nothing in silent mode, so bytes on disk are the only
honest signal. Shortcuts, the uninstall entry and the update payload all stay
NSIS's work; nothing is reimplemented here.

## Files

| File | What it is |
| --- | --- |
| `main.js` | the window, the folder validation, the spawn, the progress poll |
| `preload.js` | the six IPC calls the page may make, and no more |
| `ui/index.html`, `ui/style.css`, `ui/app.js` | the four screens: options → review → install → finish |
| `ui/app-folder.js` | the folder rules, shared by the page and the main process |
| `scripts/ui-smoke.js` | drives the page in jsdom and asserts the state machine (`npm run sim:ui`) |
| `build/icon.ico`, `build/splash.bmp` | window icon and the portable splash |

## Building

CI does this — see `.github/workflows/loader-release.yml`, step *Build the
installer window*:

```bash
# from apps/loader, after electron-builder has produced release/SNOW-LOADER-Setup-<v>.exe
mkdir -p installer/payload
cp release/SNOW-LOADER-Setup-<v>.exe installer/payload/loader-setup.exe
cd installer && npm ci && npx electron-builder --win --publish never
```

Output: `installer/dist/SNOW-LOADER-Installer-<v>.exe`. It only builds on
Windows (the payload is a Windows installer).

`payload/` is a build artifact and is gitignored; without it the window still
opens but install reports *"The installer payload is missing from this build."*
