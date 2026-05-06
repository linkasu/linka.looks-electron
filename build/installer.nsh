!include LogicLib.nsh

!macro customInstall
  SetRegView 32
  ClearErrors
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x86" "Installed"

  ${If} $1 == 1
    DetailPrint "Microsoft Visual C++ 2012 Redistributable (x86) is already installed."
  ${Else}
    File /oname=$PLUGINSDIR\vcredist_x86.exe "${BUILD_RESOURCES_DIR}\vcredist_x86.exe"
    DetailPrint "Installing Microsoft Visual C++ 2012 Redistributable (x86)..."
    ExecWait '"$PLUGINSDIR\vcredist_x86.exe" /install /quiet /norestart' $0
    Delete "$PLUGINSDIR\vcredist_x86.exe"

    ${If} $0 == 0
      DetailPrint "Microsoft Visual C++ 2012 Redistributable (x86) installed."
    ${ElseIf} $0 == 3010
      DetailPrint "Microsoft Visual C++ 2012 Redistributable (x86) installed; reboot required."
    ${Else}
      ClearErrors
      ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x86" "Installed"
      ${If} $1 == 1
        DetailPrint "Microsoft Visual C++ 2012 Redistributable (x86) is installed; redistributable exit code: $0."
      ${Else}
        MessageBox MB_ICONSTOP|MB_OK "Failed to install Microsoft Visual C++ 2012 Redistributable (x86). Exit code: $0"
        Abort
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
