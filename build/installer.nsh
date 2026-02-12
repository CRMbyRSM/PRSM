; PRSM Installer — Desktop client for OpenClaw

!macro customHeader
  BrandingText "PRSM by RSM Consulting"
!macroend

; Override electron-builder's built-in app-running check.
; Uses the nsProcess plugin (bundled with electron-builder's NSIS)
; to properly detect, gracefully close, then force-kill if needed.
!macro customCheckAppRunning
  ; Check if PRSM is running
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    ; Try graceful close first (sends WM_CLOSE)
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 3000

    ; Check again — still running?
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ; Force kill
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 2000
    ${endif}
  ${endif}
  ${nsProcess::Unload}
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\PRSM.lnk" "$INSTDIR\PRSM.exe" "" "$INSTDIR\PRSM.exe" 0
!macroend

!macro customUnInstall
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
  ${endif}
  ${nsProcess::Unload}
  Delete "$DESKTOP\PRSM.lnk"
!macroend
