/*
夸克网盘自动签到 - 长期稳定防风控版（固定 Quark UA）
支持：Quantumult X / Surge / Loon / Shadowrocket
功能：自动抓取 kps/sign/vcode/Cookie | 自动续 Cookie | 支持新版 v2 接口
防风控随机延迟 | 自动失败重试 | Cookie 失效检测
*/
const $ = new Env("夸克网盘长期稳定版");
const isRequest = typeof $request !== "undefined";
const BASE_URL = "https://drive-m.quark.cn";

// 固定真实 Quark UA
const QUARK_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X; zh-cn) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/19C56 Quark/10.9.5.3027 Mobile";

const API = {
    info: ["/1/clouddrive/capacity/growth/v2/info", "/1/clouddrive/capacity/growth/info"],
    sign: ["/1/clouddrive/capacity/growth/v2/sign", "/1/clouddrive/capacity/growth/sign"],
    task: ["/1/clouddrive/capacity/growth/task"]
};

if (isRequest) {
    extractParams();
    $.done();
} else {
    !(async () => {
        await randomSleep(5, 300);
        await doSign();
    })()
    .catch((e) => $.logErr(e))
    .finally(() => $.done());
}

/* ========================= 参数抓取 ========================= */
function extractParams() {
    const url = $request.url;
    const headers = $request.headers || {};
    const kpsMatch = url.match(/kps=([^&]+)/);
    const signMatch = url.match(/sign=([^&]+)/);
    const vcodeMatch = url.match(/vcode=([^&]+)/);
    if (!kpsMatch || !kpsMatch[1]) return;

    const kps = decodeURIComponent(kpsMatch[1]);
    const sign = signMatch ? decodeURIComponent(signMatch[1]) : " ";
    const vcode = vcodeMatch ? decodeURIComponent(vcodeMatch[1]) : " ";
    const cookie = headers.Cookie || headers.cookie || " ";

    $.setdata(kps, "quark_kps");
    $.setdata(sign, "quark_sign");
    $.setdata(vcode, "quark_vcode");
    if (cookie && cookie !== " ") $.setdata(cookie, "quark_cookie");
    $.setdata(Date.now().toString(), "quark_refresh_time");

    $.msg($.name, "✅ 参数更新成功", "已自动更新 Cookie 及 Token");
    $.log("参数已自动更新");
}

/* ========================= 主签到逻辑 ========================= */
async function doSign() {
    if (checkExpired()) return;
    const today = new Date().toDateString();
    const lastSign = $.getdata("quark_last_sign");
    if (lastSign === today) {
        $.log("今日已签到，跳过运行");
        return;
    }

    const kps = $.getdata("quark_kps");
    const sign = $.getdata("quark_sign") || " ";
    const vcode = $.getdata("quark_vcode") || " ";

    if (!kps) {
        $.msg($.name, "❌ 未获取参数", "请打开夸克网盘 App 并进入福利中心抓包");
        return;
    }

    const queryString = `pr=ucpro&fr=android&kps=${kps}&sign=${sign}&vcode=${vcode}`;

    // 模拟浏览
    await fakeBrowse(queryString);
    await randomSleep(1, 3);

    let infoData = null;
    for (let api of API.info) {
        try {
            const url = `${BASE_URL}${api}?${queryString}`;
            // 内部捕获重试，单接口失败不阻断循环
            const data = await retry(async () => await request(url));
            if (data && (data.data || data.code === 401)) {
                infoData = data;
                break;
            }
        } catch (e) {
            $.log(`info接口尝试失败: ${api}, 错误: ${e.message || e}`);
        }
    }

    if (!infoData) {
        $.msg($.name, "❌ 获取信息失败", "所有配置接口均请求超时或失效");
        return;
    }

    // Cookie 失效检测
    if (infoData.code === 401 || (infoData.message || "").includes("登录")) {
        $.msg($.name, "❌ Cookie失效", "验证凭证已过期，请重新打开夸克网盘抓包");
        return;
    }

    const growthInfo = infoData.data || {};
    const capSign = growthInfo.cap_sign || {};
    const vipStatus = growthInfo["88VIP"] || growthInfo.member_type === "VIP" ? "88VIP" : "普通用户";
    const totalCap = formatBytes(growthInfo.total_capacity || 0);

    // 已签到状态判断
    if (capSign.sign_daily === true || capSign.sign_daily_reward) {
        $.setdata(today, "quark_last_sign");
        $.log("检测到今日实际已完成签到");
        return;
    }

    await randomSleep(1, 3);
    let signSuccess = false;

    for (let api of API.sign) {
        try {
            const signUrl = `${BASE_URL}${api}?${queryString}`;
            const body = JSON.stringify({ sign_cyclic: true });
            const signData = await retry(async () => await request(signUrl, "POST", body));

            if (signData && signData.code === 0) {
                const reward = (signData.data && signData.data.sign_daily_reward) || 0;
                const progress = (capSign.sign_progress || 0) + 1;
                $.setdata(today, "quark_last_sign");
                $.msg(
                    $.name,
                    "✅ 签到成功",
                    `身份: ${vipStatus}\n容量: ${totalCap}\n获得: ${formatBytes(reward)}\n连签: ${progress}/${capSign.sign_target || "?"}`
                );
                signSuccess = true;
                break;
            } else if (signData && signData.code === 400) {
                // 或者是已经签到过的特殊code返回
                $.setdata(today, "quark_last_sign");
                $.log(`接口返回已签到: ${signData.message}`);
                signSuccess = true;
                break;
            }
        } catch (e) {
            $.log(`sign接口尝试失败: ${api}, 错误: ${e.message || e}`);
        }
    }

    if (!signSuccess) {
        $.msg($.name, "❌ 签到失败", "所有签到接口尝试均未成功");
    }
}

/* ========================= 模拟浏览 ========================= */
async function fakeBrowse(queryString) {
    const urls = [];
    API.info.forEach(api => urls.push(`${BASE_URL}${api}?${queryString}`));
    API.task.forEach(api => urls.push(`${BASE_URL}${api}?${queryString}`));
    const randomUrl = urls[Math.floor(Math.random() * urls.length)];
    try {
        $.log("开始模拟常规浏览动作...");
        await request(randomUrl);
    } catch (e) {
        $.log("模拟浏览正常结束或被跳过");
    }
}

/* ========================= 参数过期检测 ========================= */
function checkExpired() {
    const refreshTime = Number($.getdata("quark_refresh_time") || 0);
    const now = Date.now();
    if (now - refreshTime > 7 * 24 * 3600 * 1000) {
        $.msg($.name, "⚠️ 参数即将失效", "安全期已过，请重新打开一次夸克网盘触发抓包");
        return true;
    }
    return false;
}

/* ========================= 重试机制 ========================= */
async function retry(fn, count = 3) {
    let lastErr;
    for (let i = 0; i < count; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            $.log(`动作失败，正在进行第 ${i + 1} 次重试...`);
            await randomSleep(2, 6);
        }
    }
    throw lastErr;
}

/* ========================= 请求封装 ========================= */
function request(url, method = "GET", body = null) {
    return new Promise((resolve, reject) => {
        const cookie = $.getdata("quark_cookie") || " ";
        let options = {
            url: url,
            timeout: 15000,
            headers: {
                "User-Agent": QUARK_UA,
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "zh-CN,zh;q=1",
                "Connection": "keep-alive",
                "Origin": "https://b.quark.cn",
                "Referer": "https://b.quark.cn/",
                "Cookie": cookie
            }
        };
        if (method === "POST") options.body = body || "{}";
        
        const callback = (err, resp, data) => {
            if (err) {
                reject(err);
                return;
            }
            try {
                resolve(typeof data === "string" ? JSON.parse(data) : data);
            } catch (e) {
                $.log(`返回体非标准JSON，原始内容: ${data}`);
                reject("JSON解析失败");
            }
        };

        method === "GET" ? $.get(options, callback) : $.post(options, callback);
    });
}

/* ========================= 随机等待 ========================= */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function randomSleep(min, max) {
    const sec = Math.floor(Math.random() * (max - min + 1)) + min;
    $.log(`防风控：随机延迟等待 ${sec} 秒`);
    await sleep(sec * 1000);
}

/* ========================= 格式化容量 ========================= */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

/* ========================= Env 兼容层 ========================= */
function Env(name) {
    this.name = name;
    this.isSurge = () => typeof $httpClient !== "undefined";
    this.isLoon = () => typeof $loon !== "undefined";
    this.isQX = () => typeof $task !== "undefined";
    this.getdata = (key) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
        if (this.isQX()) return $prefs.valueForKey(key);
    };
    this.setdata = (val, key) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(val, key);
        if (this.isQX()) return $prefs.setValueForKey(val, key);
    };
    this.msg = (title, subtitle, body) => {
        if (this.isSurge() || this.isLoon()) $notification.post(title, subtitle, body);
        if (this.isQX()) $notify(title, subtitle, body);
        console.log(`${title}\n${subtitle}\n${body}`);
    };
    this.log = (msg) => console.log(`[${this.name}] ${msg}`);
    this.logErr = (err) => console.log(`[${this.name}] 错误: ${err}`);

    this.get = (options, callback) => {
        if (this.isQX()) {
            if (typeof options === "string") options = { url: options };
            options.method = "GET";
            $task.fetch(options).then(resp => callback(null, resp, resp.body), err => callback(err.error, null, null));
        } else if (this.isSurge() || this.isLoon()) {
            $httpClient.get(options, (err, resp, body) => callback(err, resp, body));
        }
    };
    this.post = (options, callback) => {
        if (this.isQX()) {
            if (typeof options === "string") options = { url: options };
            options.method = "POST";
            $task.fetch(options).then(resp => callback(null, resp, resp.body), err => callback(err.error, null, null));
        } else if (this.isSurge() || this.isLoon()) {
            $httpClient.post(options, (err, resp, body) => callback(err, resp, body));
        }
    };
    this.done = (val = {}) => typeof $done !== "undefined" && $done(val);
}
