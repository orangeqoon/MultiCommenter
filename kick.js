const https = require('https');
const fs = require('fs');
const path = require('path');

const NEON_DIR = "C:\\scripts\\NeonTimerApp";
const CONFIG_PATH = path.join(NEON_DIR, 'kick-config.json');
const TOKEN_PATH = path.join(NEON_DIR, 'kick-token.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}

function loadToken() {
    try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); } catch (e) { return null; }
}

function saveToken(token) {
    try { fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2)); } catch (e) {}
}

function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
        if (!options.headers) options.headers = {};
        options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        options.headers['Accept'] = 'application/json';

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function refreshAccessToken() {
    const config = loadConfig();
    const token = loadToken();
    if (!config || !token || !token.refresh_token) return null;

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: config.client_id,
        client_secret: config.client_secret
    }).toString();

    const res = await httpsRequest({
        hostname: 'id.kick.com',
        path: '/oauth/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, body);

    if (res.status === 200 && res.body && res.body.access_token) {
        const mergedToken = { ...token, ...res.body };
        saveToken(mergedToken);
        return mergedToken.access_token;
    }
    return null;
}

// 自分のユーザーIDを取得
async function getBroadcasterUserId(accessToken) {
    const res = await httpsRequest({
        hostname: 'api.kick.com',
        path: '/public/v1/users',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 200 && res.body && res.body.data && res.body.data.length > 0) {
        return res.body.data[0].user_id || res.body.data[0].id;
    }
    throw new Error('KickユーザーIDの取得に失敗しました: ' + JSON.stringify(res.body));
}

async function postComment(text) {
    const config = loadConfig();
    let token = loadToken();

    if (!config || !token || !token.access_token) {
        throw new Error('Kickの認証トークンがありません。NeonTimer側でKickのOAuth連携を行ってください。');
    }

    let accessToken = token.access_token;

    // トークン期限切れ対策：まずはリクエストを試行し、401ならリフレッシュ
    let broadcasterId = token.broadcaster_user_id;
    if (!broadcasterId) {
        try {
            broadcasterId = await getBroadcasterUserId(accessToken);
            token.broadcaster_user_id = broadcasterId;
            saveToken(token);
        } catch (e) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                accessToken = refreshed;
                broadcasterId = await getBroadcasterUserId(accessToken);
                token.broadcaster_user_id = broadcasterId;
                saveToken(token);
            } else {
                throw e;
            }
        }
    }

    const payload = JSON.stringify({
        type: "user",
        broadcaster_user_id: Number(broadcasterId),
        content: text
    });

    let res = await httpsRequest({
        hostname: 'api.kick.com',
        path: '/public/v1/chat',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);

    if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            accessToken = refreshed;
            res = await httpsRequest({
                hostname: 'api.kick.com',
                path: '/public/v1/chat',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, payload);
        }
    }

    if (res.status >= 200 && res.status < 300) {
        return res.body;
    }

    throw new Error(`Kick API Error (${res.status}): ${JSON.stringify(res.body)}`);
}

module.exports = {
    postComment
};
