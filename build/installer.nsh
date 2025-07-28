!macro customInstall
  SetOutPath "$INSTDIR"
  File "..\build\install-vc2012.ps1"
  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\install-vc2012.ps1"'
  Delete "$INSTDIR\install-vc2012.ps1"
!macroend
