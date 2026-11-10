!include LogicLib.nsh

!macro customHeader
  !ifndef BUILD_UNINSTALLER
  Function EnsureBubbleRuntime
    InitPluginsDir
    SetRegView 64
    ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
    ${If} $1 < 528040
      File /oname=$PLUGINSDIR\ndp48.exe "${BUILD_RESOURCES_DIR}\prerequisites\ndp48.exe"
      ClearErrors
      ExecWait '"$PLUGINSDIR\ndp48.exe" /q /norestart' $0
      ${If} ${Errors}
        MessageBox MB_ICONSTOP|MB_OK "Could not start .NET Framework 4.8 installation."
        Abort
      ${EndIf}
      ${If} $0 == 3010
        SetRebootFlag true
      ${ElseIf} $0 != 0
        MessageBox MB_ICONSTOP|MB_OK "Could not install .NET Framework 4.8. Exit code: $0"
        Abort
      ${EndIf}
      Delete "$PLUGINSDIR\ndp48.exe"
    ${EndIf}

    SetRegView 32
    ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x64" "Installed"
    ${If} $1 != 1
      SetRegView 64
      ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x64" "Installed"
    ${EndIf}
    ${If} $1 != 1
      File /oname=$PLUGINSDIR\vcredist_x64.exe "${BUILD_RESOURCES_DIR}\prerequisites\vcredist_x64.exe"
      ClearErrors
      ExecWait '"$PLUGINSDIR\vcredist_x64.exe" /install /quiet /norestart' $0
      ${If} ${Errors}
        MessageBox MB_ICONSTOP|MB_OK "Could not start Visual C++ 2012 x64 installation."
        Abort
      ${EndIf}
      ${If} $0 == 3010
        SetRebootFlag true
      ${ElseIf} $0 != 0
        SetRegView 32
        ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x64" "Installed"
        ${If} $1 != 1
          SetRegView 64
          ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\11.0\VC\Runtimes\x64" "Installed"
        ${EndIf}
        ${If} $1 != 1
          MessageBox MB_ICONSTOP|MB_OK "Could not install Visual C++ 2012 x64. Exit code: $0"
          Abort
        ${EndIf}
      ${EndIf}
      Delete "$PLUGINSDIR\vcredist_x64.exe"
    ${EndIf}
  FunctionEnd

    Function .onInstSuccess
      ; Only an agent that saved an update ticket will resume; never start it elevated.
      ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "--bubble-resume"
    FunctionEnd
  !endif
!macroend

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    ; Removing the app must not install runtimes or terminate a different installation.
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
    ${If} $0 != 603
      MessageBox MB_ICONSTOP|MB_OK "Close LINKa and Bubble before uninstalling."
      Abort
    ${EndIf}
    ${nsProcess::FindProcess} "Linka.TobiiBackend.exe" $0
    ${If} $0 != 603
      MessageBox MB_ICONSTOP|MB_OK "Finish Bubble from its tray before uninstalling."
      Abort
    ${EndIf}
  !else
  Call EnsureBubbleRuntime
  InitPluginsDir
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ; Send a cooperative request in the original interactive user's context.
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "--bubble-control"
  ${EndIf}
  SetOutPath "$PLUGINSDIR\bubble-control"
  File /r "${BUILD_RESOURCES_DIR}\..\extraResources\bubble-backend\*.*"
  ClearErrors
  ExecWait '"$PLUGINSDIR\bubble-control\Linka.TobiiBackend.exe" --wait-installation-exit "$INSTDIR" "${APP_EXECUTABLE_FILENAME}"' $0
  ${If} ${Errors}
    MessageBox MB_ICONSTOP|MB_OK "Could not check running LINKa processes. Close LINKa and Bubble, then retry."
    Abort
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONSTOP|MB_OK "Close LINKa and Bubble in every Windows session, then retry. No process was forcibly closed."
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  !endif
!macroend

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
