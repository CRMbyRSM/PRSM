; PRSM Installer — Desktop client for OpenClaw
; One-click install: dark branded, no wizard pages

!macro customHeader
  BrandingText "PRSM by RSM Consulting"
!macroend

!macro customInit
  ; Force-kill any running PRSM process before install/update
  nsExec::ExecToLog 'taskkill /F /IM "PRSM.exe"'
  Sleep 1000
!macroend

!macro customInstall
  ; Desktop shortcut
  CreateShortCut "$DESKTOP\PRSM.lnk" "$INSTDIR\PRSM.exe" "" "$INSTDIR\PRSM.exe" 0
!macroend

!macro customUnInstall
  ; Kill if still running during uninstall
  nsExec::ExecToLog 'taskkill /F /IM "PRSM.exe"'
  Sleep 500
  Delete "$DESKTOP\PRSM.lnk"
!macroend
