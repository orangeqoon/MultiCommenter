@echo off
chcp 65001 > nul
echo ============================================
echo   MultiCommenter (Restream Shell) Build
echo ============================================

set PACKAGER=C:\scripts\NeonTimerApp\node_modules\.bin\electron-packager.cmd

if not exist "%PACKAGER%" (
    echo [ERROR] electron-packager が見つかりません: %PACKAGER%
    pause
    exit /b 1
)

echo [1/2] スタンドアロン実行ファイル (.exe) をビルド中 (Electron v30.5.1 + オレンジ君アイコン)...
call "%PACKAGER%" "%~dp0." MultiCommenter --platform=win32 --arch=x64 --overwrite --out="%~dp0dist" --electron-version=30.5.1 --icon="%~dp0icon.ico" --prune=true

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
