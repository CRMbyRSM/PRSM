; PRSM Installer — Desktop client for OpenClaw

!macro customHeader
  BrandingText "PRSM by RSM Consulting"
!macroend

; Override electron-builder's broken app-running detection.
; The built-in _CHECK_APP_RUNNING uses PowerShell Get-CimInstance which
; false-positives when the app isn't even running (known issue #6865/#8131).
; Our version: just force-kill PRSM.exe and move on.
!macro customCheckAppRunning
  nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
  Sleep 1000
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\PRSM.lnk" "$INSTDIR\PRSM.exe" "" "$INSTDIR\PRSM.exe" 0
!macroend

!macro customUnInstall
  nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
  Sleep 500
  Delete "$DESKTOP\PRSM.lnk"
!macroend
