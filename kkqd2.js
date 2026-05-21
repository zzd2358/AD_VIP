/*
 * 夸克网盘自动获取参数 & 每日签到
 * 适配：Quantumult X, Surge, Loon
 */

const $ = new Env("夸克网盘自动签到");
const isRequest = typeof $request !== "undefined";

if (isRequest) {
    // 拦截请求，提取并保存 kps, sign, vcode
    extractParams();
    $.done();
} else {
    // 定时任务执行签到
    !(async () => {
        await doSign();
    })()
    .catch((e) => $.logErr(e))
    .finally(() => $.done());
}

// ------------------- 核心业务逻辑 -------------------

function extractParams() {
    const url = $request.url;
    // 匹配 URL 中的查询参数
    const kpsMatch = url.match(/kps=([^&]+)/);
    const signMatch = url.match(/sign=([^&]+)/);
    const vcodeMatch = url.match(/vcode=([^&]+)/);

    if (kpsMatch && kpsMatch[1]) {
        const kps = kpsMatch[1];
        const sign = signMatch ? signMatch[1] : "";
        const vcode = vcodeMatch ? vcodeMatch[1] : "";

        const oldKps = $.getdata("quark_kps");
        if (oldKps !== kps) {
            $.setdata(kps, "quark_kps");
            $.setdata(sign, "quark_sign");
            $.setdata(vcode, "quark_vcode");
            $.msg($.name, "✅ 参数获取成功", `已成功抓取 kps/sign/vcode，请关闭重写规则并依赖定时任务运行。`);
            $.log(`抓取成功: kps=${kps}, sign=${sign}, vcode=${vcode}`);
        }
    }
}

async function doSign() {
    const kps = $.getdata("quark_kps");
    const sign = $.getdata("quark_sign") || "";
    const vcode = $.getdata("quark_vcode") || "";

    if (!kps) {
        $.msg($.name, "❌ 签到失败", "未找到参数信息，请先开启重写规则进入夸克网盘 App 获取。");
        return;
    }

    const queryString = `pr=ucpro&fr=android&kps=${kps}&sign=${sign}&vcode=${vcode}`;
    const infoUrl = `https://drive-m.quark.cn/1/clouddrive/capacity/growth/info?${queryString}`;
    const signUrl = `https://drive-m.quark.cn/1/clouddrive/capacity/growth/sign?${queryString}`;

    try {
        // 1. 获取成长与容量信息
        let infoData = await request(infoUrl, "GET");
        
        if (infoData && infoData.data) {
            let growthInfo = infoData.data;
            let vipStatus = growthInfo['88VIP'] ? '88VIP' : '普通用户';
            let totalCap = formatBytes(growthInfo.total_capacity);
            let capSign = growthInfo.cap_sign || {};
            
            // 2. 判断今日是否已经签到
            if (capSign.sign_daily) {
                $.msg($.name, "ℹ️ 今日已签到", `身份: ${vipStatus}\n总容量: ${totalCap}\n今日获得: ${formatBytes(capSign.sign_daily_reward)}\n连签进度: ${capSign.sign_progress}/${capSign.sign_target}`);
                return;
            }

            // 3. 执行签到动作
            let signReqBody = JSON.stringify({ "sign_cyclic": true });
            let signData = await request(signUrl, "POST", signReqBody);

            if (signData && signData.data) {
                let reward = signData.data.sign_daily_reward;
                let newProgress = (capSign.sign_progress || 0) + 1;
                $.msg($.name, "✅ 签到成功", `身份: ${vipStatus}\n总容量: ${totalCap}\n本次获得: ${formatBytes(reward)}\n连签进度: ${newProgress}/${capSign.sign_target}`);
            } else {
                $.msg($.name, "❌ 签到异常", signData?.message || "未获取到返回数据");
            }
        } else {
            $.msg($.name, "❌ 获取成长信息失败", infoData?.message || "接口访问异常");
        }
    } catch (e) {
        $.msg($.name, "❌ 发生网络错误", e.message || e);
    }
}

// ------------------- 工具函数 -------------------

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function request(url, method = "GET", body = null) {
    return new Promise((resolve, reject) => {
        let options = {
            url: url,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X; zh-cn) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/19C56 Quark/10.9.5.3027 Mobile",
                "Content-Type": "application/json"
                            "Accept": "application/json, text/plain, */*",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "zh-CN,zh;q=1",
                "Connection": "keep-alive",
            }
        };
        if (body && method === "POST") options.body = body;

        let callback = (err, resp, data) => {
            if (err) reject(err);
            else {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            }
        };

        if (method === "GET") $.get(options, callback);
        if (method === "POST") $.post(options, callback);
    });
}

// ------------------- 底层多环境兼容 Wrapper -------------------
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
            if (typeof options == "string") options = { url: options };
            options["method"] = "GET";
            $task.fetch(options).then(resp => callback(null, resp, resp.body), err => callback(err.error, null, null));
        } else if (this.isSurge() || this.isLoon()) {
            $httpClient.get(options, (err, resp, body) => callback(err, resp, body));
        }
    };

    this.post = (options, callback) => {
        if (this.isQX()) {
            if (typeof options == "string") options = { url: options };
            options["method"] = "POST";
            $task.fetch(options).then(resp => callback(null, resp, resp.body), err => callback(err.error, null, null));
        } else if (this.isSurge() || this.isLoon()) {
            $httpClient.post(options, (err, resp, body) => callback(err, resp, body));
        }
    };

    this.done = (val = {}) => typeof $done !== "undefined" && $done(val);
}