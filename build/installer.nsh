; PRSM Installer — Desktop client for OpenClaw
; One-click install: dark branded, no wizard pages

!macro customHeader
  BrandingText "PRSM by RSM Consulting"
!macroend

!macro customInstall
  ; Desktop shortcut
  CreateShortCut "$DESKTOP\PRSM.lnk" "$INSTDIR\PRSM.exe" "" "$INSTDIR\PRSM.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\PRSM.lnk"
!macroend
