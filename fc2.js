const https = require('https');
const fs = require('fs');
const path = require('path');
const qs = require('querystring');
const WebSocket = require('C:\\scripts\\NeonTimerApp\\node_modules\\ws');

const COOKIES_PATH = path.join(__dirname, 'fc2-cookies.json');
const CAPTURED_PATH = path.join(__dirname, 'fc2_captured.json');

// キャプチャデータから直近のchannel_idやユーザー情報を取得
function getChannelInfo() {
    let channelId = '13089618'; // デフォルト
    let userName = 'orangeqoon';

    if (fs.existsSync(CAPTURED_PATH)) {
        try {
            const list = JSON.parse(fs.readFileSync(CAPTURED_PATH, 'utf8'));
            for (let i = list.length - 1; i >= 0; i--) {
                const item = list[i];
                if (item.wsUrl && item.wsUrl.includes('channels/')) {
                    const match = item.wsUrl.match(/channels\/(\d+)/);
                    if (match) channelId = match[1];
                }
                if (item.data) {
                    try {
                        const parsed = JSON.parse(item.data);
                        if (parsed.arguments && parsed.arguments.user_name) {
                            userName = parsed.arguments.user_name;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }
    return { channelId, userName };
}

function getCookies() {
    if (fs.existsSync(COOKIES_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
            if (data.cookies) {
                return Object.entries(data.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
            }
        } catch (e) {}
    }
    return '';
}

// FC2の制御サーバー情報をAPIから新規取得
function fetchControlServer(channelId, cookieStr) {
    return new Promise((resolve, reject) => {
        const body = new URLSearchParams({
            channel_id: channelId,
            mode: 'play',
            client_type: 'pc',
            client_app: 'browser_hls'
        }).toString();

        const req = https.request({
            hostname: 'live.fc2.com',
            path: '/api/getControlServer.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://live.fc2.com',
                'Referer': `https://live.fc2.com/${channelId}/`,
                'Cookie': cookieStr,
                'X-Requested-With': 'XMLHttpRequest'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.url && json.control_token) {
                        resolve(json);
                    } else {
                        reject(new Error(`getControlServer error: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// 直近のキャプチャURLがあればそれを取得
function getCachedWsUrl() {
    if (fs.existsSync(CAPTURED_PATH)) {
        try {
            const list = JSON.parse(fs.readFileSync(CAPTURED_PATH, 'utf8'));
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].wsUrl && list[i].wsUrl.includes('control_token=')) {
                    return list[i].wsUrl;
                }
            }
        } catch (e) {}
    }
    return null;
}

// オンデマンド接続でコメントを送信
async function postComment(text) {
    const { channelId, userName } = getChannelInfo();
    const cookieStr = getCookies();

    let targetWsUrl = null;

    // 1. まず getControlServer.php で最新のトークンとURLの取得を試行
    try {
        const serverInfo = await fetchControlServer(channelId, cookieStr);
        targetWsUrl = `${serverInfo.url}?control_token=${serverInfo.control_token}`;
        console.log('[FC2-Direct] 新規 control_token 取得成功:', targetWsUrl.substring(0, 80) + '...');
    } catch (err) {
        console.warn('[FC2-Direct] getControlServer 失敗、直近のキャッシュURLを試行します:', err.message);
        targetWsUrl = getCachedWsUrl();
    }

    if (!targetWsUrl) {
        throw new Error('FC2の接続先WebSocket URLが取得できませんでした。');
    }

    // 2. WebSocketを一時接続してコメントを送信
    return new Promise((resolve, reject) => {
        let isDone = false;
        const ws = new WebSocket(targetWsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://live.fc2.com'
            }
        });

        const timeout = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                ws.terminate();
                reject(new Error('FC2 WebSocket 接続タイムアウト (10秒)'));
            }
        }, 10000);

        ws.on('open', () => {
            console.log('[FC2-Direct] WebSocket接続成功。コメントを送信します...');
            const payload = JSON.stringify({
                name: 'send_comment',
                arguments: {
                    user_name: userName,
                    comment: text,
                    lang: 'ja',
                    size: 'middle',
                    color: 'black',
                    image: '',
                    anonymous: 0
                },
                id: Math.floor(Math.random() * 9000) + 1000
            });

            ws.send(payload);

            // 送信完了後、少し待って正常終了
            setTimeout(() => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeout);
                    ws.close();
                    console.log(`[FC2-Direct] コメント送信完了: "${text}"`);
                    resolve({ success: true });
                }
            }, 800);
        });

        ws.on('error', (err) => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeout);
                reject(new Error(`FC2 WebSocket エラー: ${err.message}`));
            }
        });
    });
}

function requestHttp(url, options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// FC2ライブの配信タイトル更新
async function updateTitle(newTitle) {
    const { channelId } = getChannelInfo();
    const cookieStr = getCookies();
    if (!cookieStr) {
        throw new Error("FC2のログインCookieがありません。ChromeでFC2配信管理画面を開いてください。");
    }

    console.log(`[FC2-Title] タイトル更新開始: "${newTitle}" (Channel: ${channelId})`);

    // 1. 現在のチャンネル設定を取得
    const getRes = await requestHttp('https://live.fc2.com/api/channelEdit.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookieStr,
            'Origin': 'https://live.fc2.com',
            'Referer': `https://live.fc2.com/${channelId}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }, qs.stringify({ mode: 'get', streamid: channelId, type: 'json' }));

    let curData = {};
    try {
        const current = JSON.parse(getRes.data);
        if (current.status === 1 && current.data) {
            curData = current.data;
        }
    } catch (e) {}

    // 2. ページから最新のtokenを抽出
    const pageRes = await requestHttp(`https://live.fc2.com/${channelId}/`, {
        method: 'GET',
        headers: {
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const tokenMatch = pageRes.data.match(/loginToken:\s*['"]([a-f0-9]{32,64})['"]/i) || 
                       pageRes.data.match(/token:\s*['"]([a-f0-9]{32,64})['"]/i);
    if (!tokenMatch) {
        throw new Error("FC2ページから認証トークンを取得できませんでした。ログイン状態を確認してください。");
    }
    const token = tokenMatch[1];

    // 3. 設定送信 (mode=set)
    const setPayload = {
        mode: 'set',
        type: 'json',
        streamid: channelId,
        title: newTitle,
        info: curData.info || '',
        adultflg: curData.adultFlg ?? 0,
        tweetflg: curData.tweetFlg ?? 0,
        tfollowflg: curData.tfollowFlg ?? 0,
        loginonly: curData.loginFlg ?? 0,
        giftlimit: curData.giftLimitFlg ?? 0,
        image: curData.image || '',
        feeflg: curData.feeFlg ?? 0,
        recordflg: curData.recordFlg ?? 1,
        embedflg: curData.embedFlg ?? 1,
        feesetting: curData.feeSetting ?? 0,
        stereo3d: curData.stereo3d ?? 0,
        mapping: curData.mapping ?? 0,
        horizontalview: curData.horizontalView ?? 0,
        token: token
    };

    const setRes = await requestHttp('https://live.fc2.com/api/channelEdit.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookieStr,
            'Origin': 'https://live.fc2.com',
            'Referer': `https://live.fc2.com/${channelId}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }, qs.stringify(setPayload));

    try {
        const json = JSON.parse(setRes.data);
        if (json.status === 2 || json.status === 1) {
            console.log(`[FC2-Title] タイトル更新成功: "${newTitle}"`);
            return { success: true, title: newTitle };
        } else {
            throw new Error(`更新失敗レスポンス: ${setRes.data}`);
        }
    } catch (e) {
        throw new Error(`レスポンス解析失敗: ${setRes.data}`);
    }
}

module.exports = {
    postComment,
    updateTitle
};
