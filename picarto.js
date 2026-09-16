const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'picarto-config.json');
const ONECOMME_CONFIG_PATH = path.join(process.env.APPDATA || '', 'onecomme', 'plugins', 'picarto', 'config.json');

function loadConfig() {
    // 1. MultiCommenterローカルの picarto-config.json
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (data && data.channel && data.token) return data;
        } catch (_) {}
    }

    // 2. わんコメプラグイン側の config.json を自動共有
    if (fs.existsSync(ONECOMME_CONFIG_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(ONECOMME_CONFIG_PATH, 'utf8'));
            if (data && data.channel && data.token) return data;
        } catch (_) {}
    }

    return null;
}

function maskFrame(opcode, payload) {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const len = buf.length;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = buf[i] ^ mask[i % 4];

    let header;
    if (len < 126) {
        header = Buffer.alloc(6);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | len;
        mask.copy(header, 2);
    } else if (len < 65536) {
        header = Buffer.alloc(8);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
        mask.copy(header, 4);
    } else {
        header = Buffer.alloc(14);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
        mask.copy(header, 10);
    }
    return Buffer.concat([header, masked]);
}

async function postComment(text) {
    const config = loadConfig();
    if (!config || !config.channel || !config.token) {
        throw new Error('Picartoの設定（channel, token）が見つかりません。わんコメのPicarto設定またはpicarto-config.jsonを確認してください。');
    }

    const { channel, token } = config;
    const host = 'chat.picarto.tv';
    const pathStr = '/bot/username=' + encodeURIComponent(channel.trim()) + '&password=' + encodeURIComponent(token.trim());

    return new Promise((resolve, reject) => {
        let isDone = false;
        let handshake = false;
        let buf = Buffer.alloc(0);

        const socket = tls.connect({
            host,
            port: 443,
            servername: host,
            rejectUnauthorized: false
        }, () => {
            const key = crypto.randomBytes(16).toString('base64');
            socket.write(
                'GET ' + pathStr + ' HTTP/1.1\r\n' +
                'Host: ' + host + '\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                'Sec-WebSocket-Key: ' + key + '\r\n' +
                'Sec-WebSocket-Version: 13\r\n' +
                'User-Agent: PTV-BOT-' + channel + '\r\n\r\n'
            );
        });

        const timer = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                socket.destroy();
                reject(new Error('Picarto チャットサーバーへの接続がタイムアウトしました'));
            }
        }, 10000);

        socket.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
            if (!handshake) {
                const idx = buf.indexOf('\r\n\r\n');
                if (idx < 0) return;
                const head = buf.slice(0, idx).toString('utf8');
                buf = buf.slice(idx + 4);

                if (head.includes('101')) {
                    handshake = true;
                    // メッセージ送信パケット作成
                    const payload = JSON.stringify({ type: 'chat', message: String(text) });
                    socket.write(maskFrame(0x1, payload));

                    // 送信後少し待って正常終了
                    setTimeout(() => {
                        if (!isDone) {
                            isDone = true;
                            clearTimeout(timer);
                            socket.destroy();
                            resolve({ success: true, platform: 'picarto' });
                        }
                    }, 400);
                } else {
                    if (!isDone) {
                        isDone = true;
                        clearTimeout(timer);
                        socket.destroy();
                        reject(new Error('Picarto WebSocketハンドシェイクに失敗しました: ' + head.split('\r\n')[0]));
                    }
                }
            }
        });

        socket.on('error', err => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                reject(new Error('Picarto 通信エラー: ' + err.message));
            }
        });

        socket.on('close', () => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve({ success: true, platform: 'picarto' });
            }
        });
    });
}

module.exports = {
    postComment,
    loadConfig
};
