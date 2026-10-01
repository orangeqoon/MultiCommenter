const https = require("https");
const fs = require("fs");
const path = require("path");

const CANDIDATE_PATHS = [
    path.join(__dirname, "..", "state", "services", "twitcasting-config.json"),
    "C:\\scripts\\state\\services\\twitcasting-config.json",
    "C:\\scripts\\NeonTimerApp\\NeonTimer-win32-x64\\resources\\app\\twitcasting-config.json",
    "C:\\scripts\\NeonTimerApp\\twitcasting-config.json"
];

function getToken() {
    try {
        // mtimeが最も新しいファイルを探索
        let bestFile = null;
        let bestMtime = -1;
        for (const p of CANDIDATE_PATHS) {
            if (fs.existsSync(p)) {
                const stat = fs.statSync(p);
                if (stat.mtimeMs > bestMtime) {
                    bestMtime = stat.mtimeMs;
                    bestFile = p;
                }
            }
        }

        if (bestFile) {
            const data = JSON.parse(fs.readFileSync(bestFile, "utf8"));
            return data.access_token || data.token;
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
    // /users/{id}/current_live は配信中でも404を返すことがあり信頼できないため、
    // verify_credentials が返す user.is_live / user.last_movie_id を使う
    const verify = await apiRequest("/verify_credentials", "GET", null, token);
    if (!verify.user.is_live) {
        return null; // 配信していない
    }
    return verify.user.last_movie_id;
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
