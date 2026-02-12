; PRSM Installer — Desktop client for OpenClaw

!macro customHeader
  BrandingText "PRSM by RSM Consulting"
!macroend

!macro preInit
  ; Kill PRSM before NSIS even checks if it's running
  ; This runs before the built-in "app is running" check
  ExecShellWait "" "cmd" '/c taskkill /F /IM "PRSM.exe" /T >nul 2>&1' SW_HIDE
  Sleep 1500
!macroend

!macro customInit
  ; Second kill attempt in case preInit wasn't enough
  ExecShellWait "" "cmd" '/c taskkill /F /IM "PRSM.exe" /T >nul 2>&1' SW_HIDE
  Sleep 1000
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\PRSM.lnk" "$INSTDIR\PRSM.exe" "" "$INSTDIR\PRSM.exe" 0
!macroend

!macro customUnInstall
  ExecShellWait "" "cmd" '/c taskkill /F /IM "PRSM.exe" /T >nul 2>&1' SW_HIDE
  Sleep 500
  Delete "$DESKTOP\PRSM.lnk"
!macroend
