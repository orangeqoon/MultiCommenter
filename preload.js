const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    togglePin: () => ipcRenderer.send('toggle-pin'),
    toggleClickThrough: () => ipcRenderer.send('toggle-click-through'),
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    onPinStatusChanged: (callback) => {
        ipcRenderer.on('pin-status-changed', (_event, value) => callback(value));
    },
    onClickThroughChanged: (callback) => {
        ipcRenderer.on('click-through-changed', (_event, value) => callback(value));
    }
});
