const https = require("https");
const fs = require("fs");

const COOKIES_PATH = "C:\\scripts\\NeonTimerApp\\NeonTimer-win32-x64\\resources\\app\\niconico-cookies.json";

function getCookieData() {
    try {
        if (fs.existsSync(COOKIES_PATH)) {
            const data = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
            if (data.cookies && data.cookies.user_session) {
                const cookieStr = Object.entries(data.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
                return {
                    session: data.cookies.user_session,
                    cookieStr: cookieStr
                };
            }
        }
    } catch (e) {
        console.error("NicoNico getCookieData error:", e.message);
    }
    return null;
}

function apiRequest(options, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        if (payload) {
            options.headers = options.headers || {};
            options.headers["Content-Type"] = "application/json";
            options.headers["Content-Length"] = Buffer.byteLength(payload);
        }

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(data ? JSON.parse(data) : null);
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`NicoNico API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on("error", reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function getCurrentProgramId(session, cookieStr) {
    try {
        const res = await apiRequest({
            hostname: "live2.nicovideo.jp",
            path: "/unama/api/v2/programs/latest",
            method: "GET",
            headers: {
                "Accept": "application/json",
                "X-niconico-session": session,
                "Cookie": cookieStr,
                "User-Agent": "MultiCommenter/1.0"
            }
        });
        return res?.data?.id; // "lv12345678" の形式
    } catch (e) {
        return null;
    }
}

async function postComment(text) {
    const auth = getCookieData();
    if (!auth) {
        throw new Error("ニコ生のCookieが見つかりません。Chrome拡張機能経由でニコ生を開いてください。");
    }

    const programId = await getCurrentProgramId(auth.session, auth.cookieStr);
    if (!programId) {
        throw new Error("ニコ生で現在放送中の番組が見つかりません。");
    }

    // 運営コメント投稿 (PUT /watch/{lv}/operator_comment with Cookie header)
    const options = {
        hostname: "live2.nicovideo.jp",
        path: `/watch/${programId}/operator_comment`,
        method: "PUT",
        headers: {
            "Accept": "application/json",
            "Cookie": auth.cookieStr,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
    };

    const res = await apiRequest(options, {
        text: text,
        isPermanent: false
    });

    return res;
}

module.exports = {
    postComment
};
