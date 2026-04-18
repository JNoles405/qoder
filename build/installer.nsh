; Qoder NSIS customizations
; ----------------------------------------------------------------------------
; customInit runs at the very top of .onInit — BEFORE electron-builder's
; built-in "is app running?" check. We force-kill any orphaned Qoder.exe
; processes (main window, GPU subprocess, renderer, crashpad_handler, etc.)
; so an ungracefully-closed previous session never blocks the upgrade.
;
; /F = force, /T = kill entire process tree, /IM = by image name.
; A short sleep lets Windows release file handles before the installer
; tries to overwrite files in Program Files.
; ----------------------------------------------------------------------------

!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 750
!macroend

; Same treatment on uninstall, in case the user runs the uninstaller while
; a helper process is still alive.
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 500
!macroend
