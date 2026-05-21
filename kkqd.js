/*
 * Quark Netdisk Auto Check-in & Get Cookie
 * Description: 自动获取 Cookie 并每日自动签到、做任务领空间/金币
 * Author: 
 * Version: 1.4.0
 */

const $ = new API("quark", "quark_ck");

// 兼容原始脚本的 getdata/setdata 方法
$.getdata = (key) => $.read(key);
$.setdata = (val, key) => $.write(val, key);

const COOKIE_KEY = "CookieQUARK";
const LOGINTASK = "b9ca6c75f22a430d83e2ac7cc329e434";
const FREETIME = "c2f654702eaf484c86a75fd5ff9e8a9b";
const TASKLIST = "sign_in_31-day";
const COINURL = "https://drive-m.quark.cn/1/clouddrive/capacity/coin/v1/list?";
const COINLOG = "https://drive-m.quark.cn/1/clouddrive/capacity/coin/v1/record?";

// 判断当前是请求拦截（获取Cookie）还是定时任务（执行签到）
const isRequest = typeof $request !== "undefined";

if (isRequest) {
    // 拦截请求，获取 Cookie
    getCookie();
    $.done();
} else {
    // 执行定时任务
    !(async () => {
        let cookie = $.getdata(COOKIE_KEY);
        if (!cookie) {
            console.log("❌ 未找到 Quark Cookie，请先获取 Cookie！");
            $.notify("夸克网盘", "❌ 签到失败", "未找到 Cookie，请先开启重写规则并打开夸克App获取。");
            return;
        }

        $.setstatus();
        await signin(cookie);
        await init(cookie);
    })().catch((e) => {
        console.log(`❌ 发生错误: ${e.message}`);
    }).finally(() => $.done());
}

// ----------------- 核心功能函数 -----------------

function getCookie() {
    if ($request.headers) {
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (cookie) {
            const currentCookie = $.getdata(COOKIE_KEY);
            if (currentCookie !== cookie) {
                $.setdata(cookie, COOKIE_KEY);
                $.notify("夸克网盘", "✅ 获取 Cookie 成功", "Cookie已更新，现在可以关闭获取Cookie的重写规则了！");
                console.log(`✅ 成功获取 Cookie: ${cookie}`);
            }
        }
    }
}

async function init(cookie) {
    try {
        // Get task list
        const taskListUrl = `https://pan.quark.cn/1/clouddrive/task?pr=ucpro&fr=task`;
        const taskListResp = await sendRequest(taskListUrl, cookie);
        if (taskListResp && taskListResp.data && taskListResp.data.task_list) {
            for (const task of taskListResp.data.task_list) {
                if (task.task_title === TASKLIST && task.status !== 2) {
                    console.log(`📋 Found task: ${task.task_title}, starting task...`);
                    await doTask(cookie, task.task_id, task.receive_count);
                    break;
                }
            }
        }

        // Complete daily free time task
        await freeday(cookie);

        // Get coin details
        await getCoinInfo(cookie);

        // Complete login task
        await loginTask(cookie);
    } catch (error) {
        console.log(`❌ Error in init: ${error.message}`);
    }
}

async function signin(cookie) {
    try {
        const signinUrl = "https://pan.quark.cn/1/clouddrive/task/signin";
        const signinData = { pr: "ucpro" };
        const signinResp = await sendRequest(signinUrl, cookie, "POST", signinData);
        
        if (signinResp && signinResp.data) {
            const { sign_count, history_sign_count } = signinResp.data;
            const msg = `✅ 签到成功! 今日签到: ${sign_count}, 总计: ${history_sign_count}`;
            console.log(msg);
            $.notify("夸克网盘", "每日签到状态", msg);
        } else {
            console.log("⚠️ 已签到或签到失败");
            $.notify("夸克网盘", "每日签到状态", "⚠️ 今日已签到或签到失败");
        }
    } catch (error) {
        console.log(`❌ Sign-in error: ${error.message}`);
    }
}

async function doTask(cookie, taskId, receiveCount) {
    try {
        const taskUrl = "https://pan.quark.cn/1/clouddrive/task";
        const taskData = { task_id: taskId, pr: "ucpro" };
        const taskResp = await sendRequest(taskUrl, cookie, "POST", taskData);
        
        if (taskResp && taskResp.data) {
            const { task_title, reward_count } = taskResp.data;
            console.log(`✅ Task completed: ${task_title}, Coins earned: ${reward_count}`);
            
            // Receive rewards
            await receiveTaskRewards(cookie, taskId, receiveCount);
        }
    } catch (error) {
        console.log(`❌ Task completion error: ${error.message}`);
    }
}

async function receiveTaskRewards(cookie, taskId, receiveCount) {
    try {
        const receiveUrl = "https://pan.quark.cn/1/clouddrive/task/receive";
        const receiveData = { task_id: taskId, pr: "ucpro" };
        const receiveResp = await sendRequest(receiveUrl, cookie, "POST", receiveData);
        
        if (receiveResp && receiveResp.data) {
            console.log(`✅ Reward received, Coins: ${receiveResp.data.reward_count}`);
        }
    } catch (error) {
        console.log(`❌ Reward receipt error: ${error.message}`);
    }
}

async function freeday(cookie) {
    try {
        const freeUrl = "https://pan.quark.cn/1/clouddrive/task/free_time";
        const freeData = { pr: "ucpro" };
        const freeResp = await sendRequest(freeUrl, cookie, "POST", freeData);
        
        if (freeResp && freeResp.data) {
            console.log(`✅ Daily free time task completed, Coins: ${freeResp.data.reward_count}`);
        }
    } catch (error) {
        console.log(`❌ Free time task error: ${error.message}`);
    }
}

async function getCoinInfo(cookie) {
    try {
        const coinUrl = `${COINURL}pr=ucpro&fr=task`;
        const coinResp = await sendRequest(coinUrl, cookie);
        
        if (coinResp && coinResp.data) {
            const { coin_amount } = coinResp.data;
            console.log(`💰 Current coin balance: ${coin_amount}`);
            
            // Get coin log
            await getCoinLog(cookie);
        }
    } catch (error) {
        console.log(`❌ Coin info error: ${error.message}`);
    }
}

async function getCoinLog(cookie) {
    try {
        const logUrl = `${COINLOG}pr=ucpro&fr=task&size=50`;
        const logResp = await sendRequest(logUrl, cookie);
        
        if (logResp && logResp.data && logResp.data.list) {
            const today = new Date().toISOString().split('T')[0];
            let todayCoins = 0;
            
            for (const item of logResp.data.list) {
                if (item.event_time.includes(today)) {
                    todayCoins += item.coin_count || 0;
                }
            }
            
            console.log(`📊 Today's total coins earned: ${todayCoins}`);
        }
    } catch (error) {
        console.log(`❌ Coin log error: ${error.message}`);
    }
}

async function loginTask(cookie) {
    try {
        const loginUrl = "https://pan.quark.cn/1/clouddrive/task/trigger";
        const loginData = { task_id: LOGINTASK, pr: "ucpro" };
        const loginResp = await sendRequest(loginUrl, cookie, "POST", loginData);
        
        if (loginResp && loginResp.data) {
            console.log(`✅ Login task completed`);
        }
    } catch (error) {
        console.log(`❌ Login task error: ${error.message}`);
    }
}

async function sendRequest(url, cookie, method = "GET", data = null) {
    const request = {
        url,
        headers: {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=1,
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Cookie": cookie,
            "Host": "pan.quark.cn",
            "Referer": "https://pan.quark.cn/",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X; zh-cn) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/19C56 Quark/10.9.5.3027 Mobile"
        }
    };

    if (method.toUpperCase() === "POST" && data) {
        request.body = JSON.stringify(data);
    }

    const response = await $.http[method.toLowerCase()](request);
    return response.json();
}

// ----------------- 底层封装类 -----------------

function ENV() {
    const isQX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined";
    const isBrowser = typeof window !== "undefined";
    const isNode = typeof require === "function" && !isBrowser;
    const isStash = "undefined" !== typeof $environment && $environment["stash"];
    const isShadowRocket = "undefined" !== typeof $rocket;

    const notify = (title, subtitle, message) => {
        if (isQX) $notify(title, subtitle, message);
        if (isLoon) $notification.post(title, subtitle, message);
        if (isSurge) $notification.post(title, subtitle, message);
        if (isNode) console.log(JSON.stringify({ title, subtitle, message }));
    };

    const write = (value, key) => {
        if (isQX) return $prefs.setValueForKey(value, key);
        if (isLoon) return $persistentStore.write(value, key);
        if (isSurge) return $persistentStore.write(value, key);
    };

    const read = (key) => {
        if (isQX) return $prefs.valueForKey(key);
        if (isLoon) return $persistentStore.read(key);
        if (isSurge) return $persistentStore.read(key);
    };

    return {
        isQX, isLoon, isSurge, isBrowser, isNode, isStash, isShadowRocket, notify, write, read
    };
}

function HTTP(defaultOptions = {}) {
    const { isQX, isLoon, isSurge, isNode } = ENV();
    const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];

    function send(method, options) {
        options = typeof options === "string" ? { url: options } : options;
        if (options.body && options.headers && !options.headers["Content-Type"]) {
            options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
        const timeout = options.timeout || 20000;

        let worker;
        if (isQX) {
            worker = $task.fetch({ method, url: options.url, headers: options.headers, body: options.body });
        }
        if (isLoon || isSurge || isNode) {
            const request = isNode ? require("request") : $httpClient;
            worker = new Promise((resolve, reject) => {
                request[method.toLowerCase()](options, (err, response, body) => {
                    if (err) reject(err);
                    else resolve({ statusCode: response.status || response.statusCode, headers: response.headers, body });
                });
            });
        }

        return worker.then((res) => {
            res.json = () => {
                try { return JSON.parse(res.body); } catch { return null; }
            };
            return res;
        });
    }

    const http = {};
    methods.forEach((method) => (http[method.toLowerCase()] = (options) => send(method, options)));
    return http;
}

function API(name = "untitled", debug = false) {
    const { isQX, isLoon, isSurge, isNode, isStash } = ENV();
    return new (class {
        constructor(name, debug) {
            this.name = name;
            this.debug = debug;
            this.http = HTTP();
            this.env = ENV();
            this.initCache();
        }

        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge) this.cache = JSON.parse($persistentStore.read(this.name) || "{}");
        }

        persistCache() {
            const data = JSON.stringify(this.cache);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge) $persistentStore.write(data, this.name);
        }

        write(data, key) {
            this.cache[key] = data;
            this.persistCache();
            return this.env.write(data, key);
        }

        read(key) {
            return this.env.read(key) || this.cache[key];
        }

        setstatus(status) {
            if (isQX) $prefs.setValueForKey(status, "switch_" + this.name);
        }

        notify(title, subtitle, message) {
            this.env.notify(title, subtitle, message);
        }

        done(value = {}) {
            if (isQX || isLoon || isSurge) $done(value);
        }
    })(name, debug);
}
