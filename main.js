const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let tray = null;
let isAlwaysOnTop = true;
let isClickThrough = false;

// 1. 内部サーバー (server.js) の起動
function startServer() {
    try {
        require('./server');
        console.log('[Electron] server.js を内部起動しました');
    } catch (err) {
        if (err.code === 'EADDRINUSE') {
            console.log('[Electron] ポート 18767 は既に別プロセスで使用中ですが、そのまま接続を試みます');
        } else {
            console.error('[Electron] server.js 起動エラー:', err);
        }
    }
}

// サーバー起動待機
function waitForServer(port, timeoutMs = 5000) {
    const startTime = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
                resolve(true);
            });
            req.on('error', () => {
                if (Date.now() - startTime < timeoutMs) {
                    setTimeout(check, 200);
                } else {
                    resolve(false);
                }
            });
        };
        check();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 640,
        minWidth: 340,
        minHeight: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: isAlwaysOnTop,
        hasShadow: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // サーバーの準備ができたらロード
    waitForServer(18767).then((ready) => {
        if (ready) {
            mainWindow.loadURL('http://127.0.0.1:18767/');
        } else {
            mainWindow.loadFile(path.join(__dirname, 'index.html'));
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // レンダラープロセスからの制御IPC
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.on('toggle-pin', (event) => {
        isAlwaysOnTop = !isAlwaysOnTop;
        mainWindow.setAlwaysOnTop(isAlwaysOnTop);
        event.reply('pin-status-changed', isAlwaysOnTop);
        updateTrayMenu();
    });

    ipcMain.on('toggle-click-through', (event) => {
        toggleClickThrough();
        event.reply('click-through-changed', isClickThrough);
    });

    ipcMain.on('open-voice-input', () => {
        const { exec } = require('child_process');
        exec('start chrome http://127.0.0.1:18767/speech.html');
    });

    setupShortcuts();
    setupTray();
}

function toggleClickThrough() {
    isClickThrough = !isClickThrough;
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
        mainWindow.webContents.send('click-through-changed', isClickThrough);
    }
    updateTrayMenu();
}

function setupShortcuts() {
    // Restream Chat 同等のグローバルショートカット
    // Ctrl+Shift+Space: クリック透過切り替え
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
        toggleClickThrough();
    });

    // Ctrl+Shift+T: 最前面固定切り替え
    globalShortcut.register('CommandOrControl+Shift+T', () => {
        if (mainWindow) {
            isAlwaysOnTop = !isAlwaysOnTop;
            mainWindow.setAlwaysOnTop(isAlwaysOnTop);
            mainWindow.webContents.send('pin-status-changed', isAlwaysOnTop);
            updateTrayMenu();
        }
    });
}

function setupTray() {
    // オレンジ君トレイアイコン
    const iconPath = path.join(__dirname, 'tray_icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('MultiCommenter (オレンジ君)');
    updateTrayMenu();

    tray.on('click', () => {
        if (!mainWindow) {
            createWindow();
        } else if (mainWindow.isVisible()) {
            mainWindow.focus();
        } else {
            mainWindow.show();
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '表示 / 非表示',
            click: () => {
                if (!mainWindow) {
                    createWindow();
                } else if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                }
            }
        },
        {
            label: '最前面固定',
            type: 'checkbox',
            checked: isAlwaysOnTop,
            click: () => {
                if (mainWindow) {
                    isAlwaysOnTop = !isAlwaysOnTop;
                    mainWindow.setAlwaysOnTop(isAlwaysOnTop);
                    mainWindow.webContents.send('pin-status-changed', isAlwaysOnTop);
                }
            }
        },
        {
            label: 'クリック透過 (Ctrl+Shift+Space)',
            type: 'checkbox',
            checked: isClickThrough,
            click: () => {
                toggleClickThrough();
            }
        },
        { type: 'separator' },
        {
            label: '🎙️ 音声認識アシスタントを開く (Chrome)',
            click: () => {
                const { exec } = require('child_process');
                exec('start chrome http://127.0.0.1:18767/speech.html');
            }
        },
        { type: 'separator' },
        {
            label: '終了',
            click: () => {
                app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
