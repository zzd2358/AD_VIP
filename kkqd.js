/*
 * Quark Netdisk Auto Check-in
 * Description: Automatically check in to earn coins and complete tasks
 * Author: 
 * Version: 1.3.4
 */

const $ = new API("quark", "quark_ck");
const LOGINTASK = "b9ca6c75f22a430d83e2ac7cc329e434";
const FREETIME = "c2f654702eaf484c86a75fd5ff9e8a9b";
const TASKLIST = "sign_in_31-day";
const COINURL = "https://drive-m.quark.cn/1/clouddrive/capacity/coin/v1/list?";
const COINLOG = "https://drive-m.quark.cn/1/clouddrive/capacity/coin/v1/record?";

!(async () => {
    let cookie = $.getdata("CookieQUARK");
    if (!cookie) {
        console.log("❌ No Quark cookie found, please set the cookie first!");
        return;
    }

    $.setstatus();
    await signin(cookie);
    await init(cookie);
})().catch((e) => {
    console.log(`❌ Error occurred: ${e.message}`);
}).finally(() => $.done());

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
            console.log(`✅ Sign-in successful! Today's sign-in count: ${sign_count}, Total sign-ins: ${history_sign_count}`);
        } else {
            console.log("⚠️ Already signed in today or sign-in failed");
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
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Cookie": cookie,
            "Host": "pan.quark.cn",
            "Referer": "https://pan.quark.cn/",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Quark/2.5.20 Channel/AppleStore NeDB/1.0.0 OS/ios iOS/16.5"
        }
    };

    if (method.toUpperCase() === "POST" && data) {
        request.body = JSON.stringify(data);
    }

    const response = await $.http[method.toLowerCase()](request);
    return response.json();
}

function ENV() {
    const isQX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined";
    const isBrowser = typeof window !== "undefined";
    const isNode = typeof require === "function" && !isBrowser;
    const isStash = "undefined" !== typeof $environment && $environment["stash"];
    const isShadowRocket = "undefined" !== typeof $rocket;

    const safeGet = (data) => {
        try {
            if (typeof JSON.parse(data) == "object") {
                return true;
            }
        } catch (e) {
            console.log(e);
            return false;
        }
    };

    const isAvailableStatus = (response) => {
        return response.status !== undefined && response.status >= 200 && response.status <= 299;
    };

    const notify = (title, subtitle, message) => {
        if (isQX) $notify(title, subtitle, message);
        if (isLoon) $notification.post(title, subtitle, message);
        if (isSurge) $notification.post(title, subtitle, message);
        if (isNode) console.log(JSON.stringify({ title, subtitle, message }));
        if (isBrowser) alert(message);
    };

    const write = (value, key) => {
        if (isQX) return $prefs.setValueForKey(value, key);
        if (isLoon) return $persistentStore.write(value, key);
        if (isSurge) return $storage.setItem(key, value);
    };

    const read = (key) => {
        if (isQX) return $prefs.valueForKey(key);
        if (isLoon) return $persistentStore.read(key);
        if (isSurge) return $storage.getItem(key);
    };

    const adapterStatus = (response) => {
        if (response.status) {
            response["statusCode"] = response.status;
        } else if (response.statusCode) {
            response["status"] = response.statusCode;
        }
        return response;
    };

    const get = (options, callback) => {
        options.headers["User-Agent"] = "Quantumult%20X";
        if (isQX) {
            if (typeof options.url === "string")
                options.url = options.url.replace(/@@/g, "&");
            $task.fetch(options).then(
                (response) => {
                    callback(null, adapterStatus(response), response.body);
                },
                (reason) => callback(reason.error, null, null)
            );
        }
    };

    const post = (options, callback) => {
        if (options.body) options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        options.headers["User-Agent"] = "Quantumult%20X";
        if (isQX) {
            if (typeof options.url === "string")
                options.url = options.url.replace(/@@/g, "&");
            $task.fetch(options).then(
                (response) => {
                    callback(null, adapterStatus(response), response.body);
                },
                (reason) => callback(reason.error, null, null)
            );
        }
    };

    return {
        isQX,
        isLoon,
        isSurge,
        isBrowser,
        isNode,
        isStash,
        isShadowRocket,
        notify,
        write,
        read,
        get,
        post,
        isAvailableStatus,
        safeGet,
    };
}

function HTTP(defaultOptions = {}) {
    const { isQX, isLoon, isSurge, isBrowser, isNode } = ENV();
    const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

    function send(method, options) {
        options = typeof options === "string" ? { url: options } : options;
        const baseURL = defaultOptions["url"];
        if (baseURL && !URL_REGEX.test(options.url || "")) {
            options.url = baseURL ? baseURL + options.url : options.url;
        }
        if (options.body && options.headers && !options.headers["Content-Type"]) {
            options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
        options = { ...defaultOptions, ...options };
        const timeout = options.timeout || 20000;
        const events = {
            ...{
                onRequest: () => {},
                onResponse: (resp) => resp,
                onTimeout: () => {},
            },
            ...options.events,
        };

        events.onRequest(method, options);

        let worker;
        if (isQX) {
            worker = $task.fetch({
                method,
                url: options.url,
                headers: options.headers,
                body: options.body,
            });
        }
        if (isLoon || isSurge || isNode) {
            const request = isNode ? require("request") : $httpClient;
            worker = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    events.onTimeout();
                    return reject("timeout");
                }, timeout);
                request[method.toLowerCase()](
                    options.url,
                    options,
                    (err, response, body) => {
                        clearTimeout(timer);
                        if (err) reject(err);
                        else
                            resolve(
                                events.onResponse({
                                    statusCode: response.status || response.statusCode,
                                    headers: response.headers,
                                    body,
                                })
                            );
                    }
                );
            });
        }
        if (isBrowser)
            worker = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const timer = setTimeout(() => {
                    events.onTimeout();
                    return reject("timeout");
                }, timeout);
                xhr.open(method, options.url, true);
                const headers = options.headers || {};
                Object.keys(headers).forEach((name) => {
                    xhr.setRequestHeader(name, headers[name]);
                });
                xhr.onload = () => {
                    clearTimeout(timer);
                    resolve(
                        events.onResponse({
                            statusCode: xhr.status,
                            headers: xhr.getAllResponseHeaders(),
                            body: xhr.responseText,
                        })
                    );
                };
                xhr.onerror = () => {
                    clearTimeout(timer);
                    reject(xhr.statusText);
                };
                xhr.send(options.body || "");
            });

        return worker.then((res) => {
            res.json = () => {
                try {
                    return JSON.parse(res.body);
                } catch {
                    return null;
                }
            };
            return res;
        });
    }

    const http = {};
    methods.forEach(
        (method) =>
            (http[method.toLowerCase()] = (options) => send(method, options))
    );
    return http;
}

function API(name = "untitled", debug = false) {
    const { isQX, isLoon, isSurge, isBrowser, isNode, isStash } = ENV();
    return new (class {
        constructor(name, debug) {
            this.name = name;
            this.debug = debug;

            this.http = HTTP();
            this.env = ENV();

            this.node = (() => {
                if (isNode) {
                    const fs = require("fs");

                    return {
                        fs,
                    };
                } else {
                    return null;
                }
            })();
            this.initCache();

            const delay = (t, v) =>
                new Promise(function (resolve) {
                    setTimeout(resolve.bind(null, v), t);
                });

            Promise.prototype.delay = function (t) {
                return this.then(function (v) {
                    return delay(t, v);
                });
            };
        }

        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge)
                this.cache = JSON.parse($persistentStore.read(this.name) || "{}");

            if (isNode) {
                this.cachePath =
                    "nodejs_cache_" +
                    this.name +
                    ".json";
                const exists = this.node.fs.existsSync(this.cachePath);
                const data = exists ? this.node.fs.readFileSync(this.cachePath) : "{}";
                this.cache = JSON.parse(data);
            }
        }

        persistCache() {
            const data = JSON.stringify(this.cache);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge) $persistentStore.write(data, this.name);
            if (isNode)
                this.node.fs.writeFileSync(this.cachePath, data);
        }

        write(data, key) {
            this.cache[key] = data;
            this.persistCache();
        }

        read(key) {
            return this.cache[key];
        }

        setstatus(status) {
            if (this.isQuanX()) $prefs.setValueForKey(status, "switch_" + this.name);
        }

        getstatus() {
            if (this.isQuanX())
                return $prefs.valueForKey("switch_" + this.name) === "true";
            else return true;
        }

        log(...logs) {
            if (this.debug) console.log(...logs);
        }

        info(msg) {
            console.log(`[${this.name}] Info: ${msg}`);
        }

        error(msg) {
            console.log(`[${this.name}] Error: ${msg}`);
        }

        done(value = {}) {
            if (isQX || isLoon || isSurge) {
                $done(value);
            }
        }

        isQuanX() {
            return isQX;
        }

        isLoon() {
            return isLoon;
        }

        isSurge() {
            return isSurge;
        }

        isBrowser() {
            return isBrowser;
        }

        isNode() {
            return isNode;
        }

        isStash() {
            return isStash;
        }
    })(name, debug);
}