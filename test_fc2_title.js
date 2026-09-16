const fs = require('fs');
const https = require('https');
const qs = require('querystring');

const list = JSON.parse(fs.readFileSync('fc2_title_captured.json', 'utf8'));
const capture = list.find(x => x.url.includes('channelEdit.php'));
const cookies = capture.cookies;
const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
const channelId = '13089618';

function request(url, options, postData) {
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

async function updateTitle(newTitle) {
    console.log(`[FC2] Updating title to: "${newTitle}"`);

    // 1. Get current channel settings
    const getRes = await request('https://live.fc2.com/api/channelEdit.php', {
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

    const current = JSON.parse(getRes.data);
    if (current.status !== 1) {
        throw new Error("Failed to get current channel info: " + getRes.data);
    }
    const curData = current.data;
    console.log("[FC2] Current title:", curData.title);

    // 2. Get login token from page
    const pageRes = await request(`https://live.fc2.com/${channelId}/`, {
        method: 'GET',
        headers: {
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const tokenMatch = pageRes.data.match(/loginToken:\s*['"]([a-f0-9]{32,64})['"]/i) || 
                       pageRes.data.match(/token:\s*['"]([a-f0-9]{32,64})['"]/i);
    if (!tokenMatch) {
        throw new Error("Could not find token in FC2 page HTML");
    }
    const token = tokenMatch[1];
    console.log("[FC2] Extracted token:", token);

    // 3. Send mode=set
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

    const setRes = await request('https://live.fc2.com/api/channelEdit.php', {
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

    console.log("[FC2] set response status:", setRes.status);
    console.log("[FC2] set response data:", setRes.data);

    // 4. Verify by calling mode=get again
    const verifyRes = await request('https://live.fc2.com/api/channelEdit.php', {
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

    const verifyData = JSON.parse(verifyRes.data);
    console.log("[FC2] Verified updated title:", verifyData.data?.title);
    return verifyData.data?.title === newTitle;
}

updateTitle("一生配信する【Node自動更新テスト】").catch(console.error);
