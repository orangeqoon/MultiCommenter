const https = require('https');
const fs = require('fs');
const path = require('path');

const CRED_PATH = "C:\\scripts\\NeonTimerApp\\credentials.json";
const TOKEN_PATH = "C:\\scripts\\NeonTimerApp\\NeonTimer-win32-x64\\resources\\app\\token.json";

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
    if (!fs.existsSync(CRED_PATH) || !fs.existsSync(TOKEN_PATH)) {
        throw new Error('Google認証情報(credentials.json または token.json)が見つかりません。');
    }

    const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')).web;
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

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
