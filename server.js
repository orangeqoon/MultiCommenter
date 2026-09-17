const http = require('http');
const fs = require('fs');
const path = require('path');

const niconicoApi = require('./niconico');
const twitcastingApi = require('./twitcasting');
const kukuluApi = require('./kukulu');
const twitchApi = require('./twitch');
const youtubeApi = require('./youtube');
const kickApi = require('./kick');
const fc2Api = require('./fc2');
const picartoApi = require('./picarto');

const PORT = 18767;
const pendingFc2Comments = [];

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        const htmlPath = path.join(__dirname, 'index.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(htmlPath));
        } else {
            res.writeHead(404);
            res.end("index.html not found");
        }
        return;
    }

    // 静的アイコン画像
    if (req.method === 'GET' && (req.url === '/icon.png' || req.url === '/tray_icon.png')) {
        const imgPath = path.join(__dirname, req.url.replace('/', ''));
        if (fs.existsSync(imgPath)) {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(fs.readFileSync(imgPath));
        } else {
            res.writeHead(404);
            res.end();
        }
        return;
    }

    // 保留中のFC2コメントキュー取得
    if (req.method === 'GET' && req.url === '/api/fc2_pending') {
        const comments = [...pendingFc2Comments];
        pendingFc2Comments.length = 0; // キューをクリア
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ comments }));
        return;
    }

    // FC2 Cookie 同期受付
    if (req.method === 'POST' && req.url === '/api/fc2_auth') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.cookies && Object.keys(data.cookies).length > 0) {
                    const cookieFile = path.join(__dirname, 'fc2-cookies.json');
                    fs.writeFileSync(cookieFile, JSON.stringify(data, null, 2), 'utf8');
                    console.log(`[FC2-Auth] Cookies saved (${Object.keys(data.cookies).length} cookies)`);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // FC2 タイトル変更（HTTP通信/Form送信）キャプチャ受付
    if (req.method === 'POST' && req.url === '/api/fc2_title_capture') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const captureData = JSON.parse(body);
                console.log(`\n========================================`);
                console.log(`[FC2-Title-Captured] タイトル変更通信を検出! (${captureData.kind || 'http'})`);
                console.log(`URL: ${captureData.url}`);
                console.log(`Method: ${captureData.method}`);
                console.log(`Body:`, captureData.body);
                console.log(`========================================\n`);

                const titleFile = path.join(__dirname, 'fc2_title_captured.json');
                let list = [];
                if (fs.existsSync(titleFile)) {
                    try { list = JSON.parse(fs.readFileSync(titleFile, 'utf8')); } catch (e) {}
                }
                list.push(captureData);
                fs.writeFileSync(titleFile, JSON.stringify(list, null, 2), 'utf8');

                // Cookieも保存
                if (captureData.cookies && Object.keys(captureData.cookies).length > 0) {
                    const cookieFile = path.join(__dirname, 'fc2-cookies.json');
                    fs.writeFileSync(cookieFile, JSON.stringify({ cookies: captureData.cookies, timestamp: Date.now() }, null, 2), 'utf8');
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // FC2 WebSocket キャプチャ受付
    if (req.method === 'POST' && req.url === '/api/fc2_capture') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const captureData = JSON.parse(body);
                console.log(`\n========================================`);
                console.log(`[FC2-Captured] 新しいWebSocket通信を検出! (${captureData.direction})`);
                console.log(`URL: ${captureData.wsUrl}`);
                console.log(`Data:`, captureData.data);
                console.log(`========================================\n`);

                const captureFile = path.join(__dirname, 'fc2_captured.json');
                let list = [];
                if (fs.existsSync(captureFile)) {
                    try { list = JSON.parse(fs.readFileSync(captureFile, 'utf8')); } catch (e) {}
                }
                list.push(captureData);
                fs.writeFileSync(captureFile, JSON.stringify(list, null, 2), 'utf8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/comment') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { text, targets } = data;
                if (!text || !targets || !Array.isArray(targets)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
                    return;
                }

                const results = {};
                const promises = [];

                // 1. ニコニコ生放送
                if (targets.includes('niconico')) {
                    promises.push(
                        niconicoApi.postComment(text)
                            .then(() => { results.niconico = { success: true }; })
                            .catch(e => { results.niconico = { success: false, error: e.message }; })
                    );
                }

                // 2. ツイキャス
                if (targets.includes('twitcasting')) {
                    promises.push(
                        twitcastingApi.postComment(text)
                            .then(() => { results.twitcasting = { success: true }; })
                            .catch(e => { results.twitcasting = { success: false, error: e.message }; })
                    );
                }

                // 3. KukuluLIVE
                if (targets.includes('kukulu')) {
                    promises.push(
                        kukuluApi.postComment(text)
                            .then(() => { results.kukulu = { success: true }; })
                            .catch(e => { results.kukulu = { success: false, error: e.message }; })
                    );
                }

                // 4. Twitch
                if (targets.includes('twitch')) {
                    promises.push(
                        twitchApi.postComment(text)
                            .then(() => { results.twitch = { success: true }; })
                            .catch(e => { results.twitch = { success: false, error: e.message }; })
                    );
                }

                // 5. YouTube Live
                if (targets.includes('youtube')) {
                    promises.push(
                        youtubeApi.postComment(text)
                            .then(() => { results.youtube = { success: true }; })
                            .catch(e => { results.youtube = { success: false, error: e.message }; })
                    );
                }

                // 6. Kick
                if (targets.includes('kick')) {
                    promises.push(
                        kickApi.postComment(text)
                            .then(() => { results.kick = { success: true }; })
                            .catch(e => { results.kick = { success: false, error: e.message }; })
                    );
                }

                // 7. FC2 Live (Node.js直接WebSocketオンデマンド接続)
                if (targets.includes('fc2')) {
                    promises.push(
                        fc2Api.postComment(text)
                            .then(() => { results.fc2 = { success: true }; })
                            .catch(e => { results.fc2 = { success: false, error: e.message }; })
                    );
                }

                // 8. Picarto.tv (Node.js直接WebSocketオンデマンド接続)
                if (targets.includes('picarto')) {
                    promises.push(
                        picartoApi.postComment(text)
                            .then(() => { results.picarto = { success: true }; })
                            .catch(e => { results.picarto = { success: false, error: e.message }; })
                    );
                }

                await Promise.all(promises);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, results }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`=========================================`);
    console.log(` MultiCommenter サーバー稼働中 (ポート ${PORT})`);
    console.log(`=========================================`);

    // 起動時に各サービスのトークン有効性を事前チェックして自動修復
    setTimeout(() => preflightTokenCheck(), 2000);
});

// --- 起動時トークン事前チェック＆自動修復 ---
async function preflightTokenCheck() {
    console.log('[Preflight] トークンの事前チェックを開始...');
    await checkTwitchToken();
}

async function checkTwitchToken() {
    const https = require('https');
    const fs = require('fs');
    const CONFIG_PATH = 'C:\\scripts\\NeonTimerApp\\twitch-config.json';

    let config;
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.log('[Preflight][Twitch] 設定ファイルなし。スキップ。');
        return;
    }
    if (!config.access_token) {
        console.log('[Preflight][Twitch] トークンなし。スキップ。');
        return;
    }

    // アクセストークンの有効性確認
    const isValid = await new Promise(resolve => {
        const req = https.request({
            hostname: 'api.twitch.tv',
            path: '/helix/users',
            method: 'GET',
            headers: {
                'Client-Id': config.client_id,
                'Authorization': `Bearer ${config.access_token}`
            }
        }, res => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.end();
    });

    if (isValid) {
        console.log('[Preflight][Twitch] ✅ トークン有効。');
        return;
    }

    // 期限切れ → リフレッシュ自動実行
    console.log('[Preflight][Twitch] ⚠️  トークン期限切れ。自動リフレッシュ中...');
    const { refreshAccessToken } = twitchApi;
    const newToken = await refreshAccessToken(config);

    if (newToken) {
        console.log('[Preflight][Twitch] ✅ 自動リフレッシュ成功！次回コメントからそのまま使えます。');
    } else {
        console.log('[Preflight][Twitch] ❌ リフレッシュ失敗。NeonTimerApp\\auth_twitch.bat を実行して再認証してください。');
        // ユーザーに気づかせるため、自動でブラウザ起動
        const { exec } = require('child_process');
        const batPath = 'C:\\scripts\\NeonTimerApp\\auth_twitch.bat';
        if (fs.existsSync(batPath)) {
            console.log('[Preflight][Twitch] ブラウザで認証ページを自動で開きます...');
            exec(`start "" "${batPath}"`);
        }
    }
}

