!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "欢迎安装时序"
  !define MUI_WELCOMEPAGE_TEXT "时序帮助你安排日程、规划学习与工作。$\r$\n$\r$\n下一步可选择安装位置。个人日程与配置独立保存在当前 Windows 用户的数据目录中，升级、卸载与重装默认保留。$\r$\n$\r$\n全新用户从空白日程开始，安装包不附带测试计划。安装前请保存并退出旧版。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "local.shixu.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "local.shixu.desktop"
  ${EndIf}
!macroend

; Keep an existing opt-in startup entry valid if a later installation changes paths.
; Do not create a startup entry, or change its Windows enabled/disabled state, here.
!macro customInstall
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "local.shixu.desktop"
  ${If} $R0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "local.shixu.desktop" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --startup'
  ${EndIf}
!macroend

; Never force-stop an app: its editors may contain unsaved personal records.
; This hook is shared by installer and uninstaller, including silent upgrades.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先保存并退出所有时序窗口，再重新运行安装或卸载程序。当前操作已取消，不会强制关闭应用。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
