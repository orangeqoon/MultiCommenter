const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const CRED_CANDIDATES = [
    path.join(ROOT_DIR, 'state', 'tokens', 'credentials.json'),
    path.join(__dirname, '..', 'NeonTimerApp', 'credentials.json')
];

const TOKEN_CANDIDATES = [
    path.join(ROOT_DIR, 'state', 'tokens', 'token.json'),
    path.join(__dirname, '..', 'NeonTimerApp', 'NeonTimer-win32-x64', 'resources', 'app', 'token.json')
];

function findLatest(candidates) {
    let best = null;
    let bestMtime = -1;
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            if (stat.mtimeMs > bestMtime) {
                bestMtime = stat.mtimeMs;
                best = p;
            }
        }
    }
    return best;
}

function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// リフレッシュトークンから新しいアクセストークンを取得
async function getAccessToken() {
    const credPath = findLatest(CRED_CANDIDATES);
    const tokenPath = findLatest(TOKEN_CANDIDATES);

    if (!credPath || !tokenPath) {
        throw new Error('Google認証情報(credentials.json または token.json)が見つかりません。');
    }

    const rawCred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const cred = rawCred.installed || rawCred.web || rawCred;
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

    if (!cred.client_id || !cred.client_secret || !token.refresh_token) {
        throw new Error('Google認証情報に必要なキー(client_id, client_secret, refresh_token)が不足しています。');
    }

    const body = new URLSearchParams({
        client_id: cred.client_id,
        client_secret: cred.client_secret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token'
    }).toString();

    const res = await httpsRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);

    if (res.status === 200 && res.data.access_token) {
        try {
            token.access_token = res.data.access_token;
            if (res.data.expires_in) {
                token.expiry_date = Date.now() + res.data.expires_in * 1000;
            }
            fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2), 'utf8');
        } catch (_) {
            // 書戻し失敗は無視してメモリのトークンで継続
        }
        return res.data.access_token;
    }

    throw new Error('Googleアクセストークンの更新に失敗しました: ' + JSON.stringify(res.data));
}

// 現在の配信の liveChatId を取得
async function getLiveChatId(accessToken) {
    for (const status of ['active', 'upcoming']) {
        const res = await httpsRequest({
            hostname: 'www.googleapis.com',
            path: `/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=${status}&maxResults=5`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (res.status === 200 && res.data.items && res.data.items.length > 0) {
            for (const item of res.data.items) {
                if (item.snippet && item.snippet.liveChatId) {
                    console.log(`[YouTube] 配信枠検出: "${item.snippet.title}" (chatId: ${item.snippet.liveChatId})`);
                    return item.snippet.liveChatId;
                }
            }
        }
    }

    // active / upcoming で見つからない場合、mine=true を探索
    const mineRes = await httpsRequest({
        hostname: 'www.googleapis.com',
        path: '/youtube/v3/liveBroadcasts?part=snippet&mine=true&maxResults=5',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    if (mineRes.status === 200 && mineRes.data.items && mineRes.data.items.length > 0) {
        for (const item of mineRes.data.items) {
            if (item.snippet && item.snippet.liveChatId) {
                console.log(`[YouTube] 配信枠検出(mine): "${item.snippet.title}" (chatId: ${item.snippet.liveChatId})`);
                return item.snippet.liveChatId;
            }
        }
    }

    return null;
}

// チャットメッセージを投稿
async function postComment(text) {
    const accessToken = await getAccessToken();
    const liveChatId = await getLiveChatId(accessToken);

    if (!liveChatId) {
        throw new Error('YouTubeで現在進行中（または開始前）の配信枠が見つからないか、チャットが無効化されています。');
    }

    const payload = JSON.stringify({
        snippet: {
            liveChatId: liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
                messageText: text
            }
        }
    });

    const res = await httpsRequest({
        hostname: 'www.googleapis.com',
        path: '/youtube/v3/liveChat/messages?part=snippet',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);

    if (res.status >= 200 && res.status < 300) {
        console.log(`[YouTube] コメント投稿成功: "${text}"`);
        return res.data;
    }

    throw new Error(`YouTube API Error (${res.status}): ${JSON.stringify(res.data)}`);
}

module.exports = {
    postComment
};
