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
; Three passes + long total sleep (~4s) because:
;   1. Electron helper processes can briefly respawn after the first kill.
;   2. Windows Defender real-time protection holds file handles on .exe/.dll
;      files for a second or two after the process dies, which blocks the
;      old uninstaller from deleting them and causes "Failed to uninstall
;      old application files" (NSIS exit code 2).
; ----------------------------------------------------------------------------

!macro preInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1000
!macroend

; Uninstaller path — customUnInit runs early in the uninstaller's .onInit.
; There is no preUnInit macro, so this is the correct hook. Same multi-pass
; kill strategy so a future installer invoking THIS uninstaller silently
; (during an upgrade) doesn't run into locked files.
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM "Qoder.exe"'
  Sleep 1000
!macroend
