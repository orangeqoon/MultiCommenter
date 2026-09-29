const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } = require('electron');
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
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Windowsで常に最前面をキープ
    mainWindow.setAlwaysOnTop(isAlwaysOnTop);

    // サーバーの準備ができたらロード
    waitForServer(18767).then((ready) => {
        if (ready) {
            mainWindow.loadURL('http://127.0.0.1:18767/');
        } else {
            mainWindow.loadFile(path.join(__dirname, 'index.html'));
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('pin-status-changed', isAlwaysOnTop);
        mainWindow.webContents.send('click-through-changed', isClickThrough);
    });

    mainWindow.on('closed', () => {
        stopMousePolling();
        mainWindow = null;
    });

    // レンダラープロセスからの制御IPC
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.on('toggle-pin', () => {
        isAlwaysOnTop = !isAlwaysOnTop;
        if (mainWindow) {
            mainWindow.setAlwaysOnTop(isAlwaysOnTop);
            mainWindow.webContents.send('pin-status-changed', isAlwaysOnTop);
        }
        updateTrayMenu();
    });

    ipcMain.on('toggle-click-through', () => {
        toggleClickThrough();
    });

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setIgnoreMouseEvents(ignore, options);
        }
    });

    setupShortcuts();
    setupTray();
}

let mousePollInterval = null;

function toggleClickThrough() {
    isClickThrough = !isClickThrough;
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
        mainWindow.webContents.send('click-through-changed', isClickThrough);
        if (isClickThrough) {
            startMousePolling();
        } else {
            stopMousePolling();
        }
    }
    updateTrayMenu();
}

// クリック透過（Ghost Mode）中もタイトルバーだけはマウス操作可能にするスマートポーリング
function startMousePolling() {
    if (mousePollInterval) return;
    mousePollInterval = setInterval(() => {
        if (!mainWindow || !isClickThrough || mainWindow.isDestroyed()) {
            stopMousePolling();
            return;
        }
        try {
            const point = screen.getCursorScreenPoint();
            const bounds = mainWindow.getBounds();
            // タイトルバー領域（上部48px）にカーソルがある場合はクリックを受け付ける
            const isOverTitlebar = (
                point.x >= bounds.x &&
                point.x <= bounds.x + bounds.width &&
                point.y >= bounds.y &&
                point.y <= bounds.y + 48
            );
            mainWindow.setIgnoreMouseEvents(!isOverTitlebar, { forward: true });
        } catch (e) {}
    }, 80);
}

function stopMousePolling() {
    if (mousePollInterval) {
        clearInterval(mousePollInterval);
        mousePollInterval = null;
    }
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
            label: '最前面固定 (Ctrl+Shift+T)',
            type: 'checkbox',
            checked: isAlwaysOnTop,
            click: () => {
                if (mainWindow) {
                    isAlwaysOnTop = !isAlwaysOnTop;
                    mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
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
