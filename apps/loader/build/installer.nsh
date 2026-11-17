; Included into electron-builder's NSIS script (build/installer.nsh is picked up
; automatically when `directories.buildResources` is `build`).
;
; Why this exists
; ---------------
; The default assisted installer opens on a hand-built nsDialogs page that asks
; "install for all users or only for me". That page draws its own labels and
; radio buttons, and on some machines it renders with no text at all — empty
; radio labels, empty Next/Cancel buttons — which leaves the user staring at a
; blank wizard with no way forward.
;
; This app has always installed per-user (no UAC, and an update never needs
; administrator rights), so the question was never a real choice. Forcing
; current-user here removes the page entirely: the installer goes
; directory -> progress -> finish, using only stock MUI pages.
;
; Keep `perMachine: false` in electron-builder.yml in step with this: the two
; together are what make the per-user path the only path.

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
