@echo off
chcp 65001 > nul
echo ============================================
echo   MultiCommenter (Restream Shell) Build
echo ============================================

set LOCAL_PACKAGER=%~dp0..\NeonTimerApp\node_modules\.bin\electron-packager.cmd

if exist "%LOCAL_PACKAGER%" (
    set "PACKAGER_CMD=call "%LOCAL_PACKAGER%""
    echo [INFO] NeonTimerApp 内の electron-packager を使用します。
) else (
    where electron-packager >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PACKAGER_CMD=electron-packager"
        echo [INFO] グローバルにインストールされた electron-packager を使用します。
    ) else (
        set "PACKAGER_CMD=npx --yes electron-packager"
        echo [INFO] npx 経由で electron-packager を実行します。
    )
)

echo [1/2] スタンドアロン実行ファイル (.exe) をビルド中 (Electron v30.5.1 + オレンジ君アイコン)...
%PACKAGER_CMD% "%~dp0." MultiCommenter --platform=win32 --arch=x64 --overwrite --out="%~dp0dist" --electron-version=30.5.1 --icon="%~dp0icon.ico" --prune=true

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================
    echo [成功] ビルドが完了しました！
    echo 出力先: %~dp0dist\MultiCommenter-win32-x64\MultiCommenter.exe
    echo ============================================
) else (
    echo.
    echo [ERROR] ビルド中にエラーが発生しました。
)

pause
