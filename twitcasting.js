const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = "C:\\scripts\\NeonTimerApp\\NeonTimer-win32-x64\\resources\\app\\twitcasting-config.json"; // 既存の設定ファイルを再利用

function getToken() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
            return data.access_token;
        }
    } catch (e) {
        console.error("TwitCasting getToken error:", e.message);
    }
    return null;
}

function apiRequest(apiPath, method, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: "apiv2.twitcasting.tv",
            path: apiPath,
            method: method,
            headers: {
                "Accept": "application/json",
                "X-Api-Version": "2.0",
                "Authorization": `Bearer ${token}`,
                "User-Agent": "MultiCommenter/1.0"
            }
        };

        if (payload) {
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
                    reject(new Error(`TwitCasting API Error: ${res.statusCode} ${data}`));
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

async function getCurrentMovieId(token) {
    // ユーザー情報を取得して screen_id を特定（または verify で十分）
    // verify credential 
    const verify = await apiRequest("/verify_credentials", "GET", null, token);
    const screen_id = verify.user.screen_id;
    
    // 現在のライブを取得
    try {
        const liveRes = await apiRequest(`/users/${screen_id}/current_live`, "GET", null, token);
        return liveRes.movie.id;
    } catch (e) {
        if (e.message.includes("404")) {
            return null; // 配信していない
        }
        throw e;
    }
}

async function postComment(text) {
    const token = getToken();
    if (!token) {
        throw new Error("ツイキャスのトークンがありません。NeonTimer側で連携を済ませてください。");
    }

    const movieId = await getCurrentMovieId(token);
    if (!movieId) {
        throw new Error("ツイキャスで現在配信中の枠が見つかりません。");
    }

    const res = await apiRequest(`/movies/${movieId}/comments`, "POST", {
        comment: text,
        sns: "none"
    }, token);
    
    return res;
}

module.exports = {
    postComment
};
