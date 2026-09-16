const https = require('https');
const fs = require('fs');

const CONFIG_PATH = "C:\\scripts\\NeonTimerApp\\kukulu-config.json";

function getApiKey() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
            if (data.apikey && data.apikey !== 'YOUR_KUKULU_APIKEY_HERE') {
                return data.apikey;
            }
        }
    } catch (e) {}
    return null;
}

function postComment(text) {
    return new Promise((resolve, reject) => {
        const apikey = getApiKey();
        if (!apikey) {
            return reject(new Error("KukuluのAPIキーが設定されていません。"));
        }

        const url = `https://live.erinn.biz/api/?category=comment&type=write&apikey=${encodeURIComponent(apikey)}&comment=${encodeURIComponent(text)}`;
        
        https.get(url, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success === 1) {
                        resolve(json);
                    } else {
                        reject(new Error(json.error_display || `Error code: ${json.error}`));
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${data}`));
                }
            });
        }).on("error", reject);
    });
}

module.exports = {
    postComment
};
