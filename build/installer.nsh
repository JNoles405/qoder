; Qoder NSIS customizations
; ----------------------------------------------------------------------------
; preInit runs at the START of .onInit — BEFORE electron-builder's built-in
; CHECK_APP_RUNNING macro (which is inserted inside initMultiUser, later in
; .onInit). We force-kill any orphaned Qoder.exe processes (main window, GPU
; subprocess, renderer, crashpad_handler, etc.) so an ungracefully-closed
; previous session never trips the "can't close Qoder" dialog on upgrade.
;
; IMPORTANT: must be `preInit`, not `customInit` — customInit fires AFTER
; the app-running check and is therefore useless for this purpose.
;
; /F = force, /T = kill entire process tree, /IM = by image name.
; Two passes + sleep because Electron's helper processes can briefly
; respawn, and Windows needs a moment to release file handles in
; Program Files before the installer overwrites them.
; ----------------------------------------------------------------------------

!macro preInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 500
!macroend

; Uninstaller path — customUnInit runs early in the uninstaller's .onInit,
; there is no preUnInit macro, so this is the right hook on the uninstall side.
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1000
!macroend
