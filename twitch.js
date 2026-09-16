const https = require('https');
const fs = require('fs');

const CONFIG_PATH = "C:\\scripts\\NeonTimerApp\\twitch-config.json";

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
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

async function refreshAccessToken(config) {
    if (!config || !config.refresh_token || !config.client_id || !config.client_secret) {
        return null;
    }
    console.log('[Twitch] アクセストークン期限切れのためリフレッシュを試みます...');
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
        client_id: config.client_id,
        client_secret: config.client_secret
    }).toString();

    const res = await httpsRequest({
        hostname: 'id.twitch.tv',
        path: '/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);

    if (res.status === 200 && res.body && res.body.access_token) {
        config.access_token = res.body.access_token;
        if (res.body.refresh_token) config.refresh_token = res.body.refresh_token;
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
            console.log('[Twitch] トークンのリフレッシュと保存に成功しました。');
        } catch (err) {
            console.error('[Twitch] トークン保存失敗:', err.message);
        }
        return config.access_token;
    }
    console.error('[Twitch] トークンリフレッシュ失敗:', res.body);
    return null;
}

async function getBroadcasterId(config) {
    let res = await httpsRequest({
        hostname: 'api.twitch.tv',
        path: '/helix/users',
        method: 'GET',
        headers: {
            'Client-Id': config.client_id,
            'Authorization': `Bearer ${config.access_token}`
        }
    });

    if (res.status === 401) {
        const refreshed = await refreshAccessToken(config);
        if (refreshed) {
            res = await httpsRequest({
                hostname: 'api.twitch.tv',
                path: '/helix/users',
                method: 'GET',
                headers: {
                    'Client-Id': config.client_id,
                    'Authorization': `Bearer ${config.access_token}`
                }
            });
        }
    }

    if (res.status === 200 && res.body.data && res.body.data.length > 0) {
        return res.body.data[0].id;
    }
    throw new Error('Twitchユーザー情報の取得に失敗しました: ' + (typeof res.body === 'object' ? JSON.stringify(res.body) : res.body));
}

async function postComment(text) {
    const config = loadConfig();
    if (!config || !config.access_token) {
        throw new Error('Twitchの設定が見つかりません。NeonTimerのauth_twitch.bat等で認証を行ってください。');
    }

    const broadcasterId = await getBroadcasterId(config);
    const payload = JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: broadcasterId,
        message: text
    });

    const sendChat = (token) => {
        return httpsRequest({
            hostname: 'api.twitch.tv',
            path: '/helix/chat/messages',
            method: 'POST',
            headers: {
                'Client-Id': config.client_id,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, payload);
    };

    let res = await sendChat(config.access_token);

    if (res.status === 401) {
        const refreshed = await refreshAccessToken(config);
        if (refreshed) {
            res = await sendChat(config.access_token);
        }
    }

    if (res.status >= 200 && res.status < 300) {
        return res.body;
    }

    if (res.status === 403 || res.body?.message?.includes('scope')) {
        throw new Error('Twitchのコメント投稿権限(user:write:chat)がありません。auth_twitch.batで再認証してください。');
    }

    throw new Error(`Twitch API Error (${res.status}): ${JSON.stringify(res.body)}`);
}

module.exports = {
    postComment,
    refreshAccessToken
};
