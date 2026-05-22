/*
夸克网盘自动签到 - 真长期稳定防风控版
支持：Quantumult X / Surge / Loon / Shadowrocket
功能：
自动抓取 Cookie / kps / sign / vcode
自动 Cookie 更新
支持新版 v2 接口
多接口 fallback
风控随机延迟
自动失败重试
JSON 容错
风控页面兼容
Cookie 失效检测
长期稳定版
抓包地址：
https://drive-m.quark.cn/1/clouddrive/capacity/growth/
建议 cron：
0 8,12,18 * * *
*/

const $ = new Env("夸克网盘长期稳定版");
const isRequest = typeof $request !== "undefined";
const BASE_URL = "https://drive-m.quark.cn";

// 固定真实 Quark UA
const QUARK_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X; zh-cn) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/19C56 Quark/10.9.5.3027 Mobile";

const API = {
  info: [
    "/1/clouddrive/capacity/growth/v2/info",
    "/1/clouddrive/capacity/growth/info"
  ],
  sign: [
    "/1/clouddrive/capacity/growth/v2/sign",
    "/1/clouddrive/capacity/growth/sign"
  ],
  task: [
    "/1/clouddrive/capacity/growth/task"
  ]
};

if (isRequest) {
  extractParams();
  $.done();
} else {
  !(async () => {
    // 防风控随机启动
    await randomSleep(3, 15);
    await doSign();
  })()
  .catch((e) => $.logErr(e))
  .finally(() => $.done());
}

/* ========================= 参数抓取 ========================= */
function extractParams() {
  const url = $request.url || "";
  const headers = $request.headers || {};
  
  const kpsMatch = url.match(/kps=([^&]+)/);
  const signMatch = url.match(/sign=([^&]+)/);
  const vcodeMatch = url.match(/vcode=([^&]+)/);
  
  const cookie = headers.Cookie || headers.cookie || "";
  let isUpdated = false;

  if (kpsMatch && kpsMatch[1]) {
    const kps = decodeURIComponent(kpsMatch[1]);
    $.setdata(kps, "quark_kps");
    isUpdated = true;
  }
  
  if (signMatch && signMatch[1]) {
    const sign = decodeURIComponent(signMatch[1]);
    $.setdata(sign, "quark_sign");
    isUpdated = true;
  }
  
  if (vcodeMatch && vcodeMatch[1]) {
    const vcode = decodeURIComponent(vcodeMatch[1]);
    $.setdata(vcode, "quark_vcode");
    isUpdated = true;
  }

  if (cookie) {
    $.setdata(cookie, "quark_cookie");
    isUpdated = true;
  }

  if (isUpdated) {
    $.setdata(Date.now().toString(), "quark_refresh_time");
    $.msg($.name, "✅ 参数更新成功", "Cookie / Token 已自动更新");
    $.log("参数更新成功");
  } else {
    $.log("未匹配到有效参数或 Cookie");
  }
}

/* ========================= 主签到逻辑 ========================= */
async function doSign() {
  if (checkExpired()) return;
  
  const today = new Date().toDateString();
  const lastSign = $.getdata("quark_last_sign");
  if (lastSign === today) {
    $.log("今日已签到，跳过");
    return;
  }

  const kps = $.getdata("quark_kps");
  const sign = $.getdata("quark_sign") || "";
  const vcode = $.getdata("quark_vcode") || "";

  if (!kps) {
    $.msg($.name, "❌ 未获取参数", "请打开夸克网盘 App 并进入福利中心抓包");
    return;
  }

  const queryString = `pr=ucpro&fr=android&kps=${encodeURIComponent(kps)}&sign=${encodeURIComponent(sign)}&vcode=${encodeURIComponent(vcode)}`;

  // 模拟浏览
  await fakeBrowse(queryString);
  await randomSleep(2, 8);

  let infoData = null;
  for (const api of API.info) {
    try {
      const url = `${BASE_URL}${api}?${queryString}`;
      $.log(`尝试 info 接口: ${api}`);
      
      infoData = await retry(async () => {
        return await request(url);
      });

      if (infoData && (infoData.data || infoData.code === 401 || infoData.code === -1 || infoData.status === 200 || infoData.status === 500)) {
        break;
      }
    } catch (e) {
      $.log(`info 接口失败: ${api}`);
      $.log(String(e));
    }
  }

  if (!infoData) {
    $.msg($.name, "❌ 获取信息失败", "所有接口请求失败");
    return;
  }

  // Cookie失效检测
  if (infoData.code === 401 || infoData.code === -1 || infoData.status === 500 || /登录|login|invalid|expired/i.test(infoData.message || "")) {
    $.msg($.name, "❌ Cookie 已失效", "请重新打开夸克网盘抓包");
    return;
  }

  const growthInfo = infoData.data || {};
  const capSign = growthInfo.cap_sign || {};
  const vipStatus = (growthInfo["88VIP"] || growthInfo.member_type === "VIP") ? "88VIP" : "普通用户";
  const totalCap = formatBytes(growthInfo.total_capacity || 0);

  // 已签到检测
  if (capSign.sign_daily === true || typeof capSign.sign_daily_reward !== "undefined") {
    $.setdata(today, "quark_last_sign");
    $.log("检测到今日已签到");
    return;
  }

  await randomSleep(3, 12);
  let signSuccess = false;

  for (const api of API.sign) {
    try {
      const signUrl = `${BASE_URL}${api}?${queryString}`;
      $.log(`尝试签到接口: ${api}`);
      const body = JSON.stringify({ sign_cyclic: true });

      const signData = await retry(async () => {
        return await request(signUrl, "POST", body);
      });

      $.log(JSON.stringify(signData));

      // 成功
      if (signData && signData.code === 0) {
        const reward = signData.data?.sign_daily_reward || 0;
        const progress = (capSign.sign_progress || 0) + 1;
        
        $.setdata(today, "quark_last_sign");
        await randomSleep(2, 5);

        $.msg(
          $.name,
          "✅ 签到成功",
          `身份: ${vipStatus}\n容量: ${totalCap}\n获得: ${formatBytes(reward)}\n连签: ${progress}/${capSign.sign_target || "?"}`
        );
        signSuccess = true;
        break;
      }

      // 已签到
      if (signData && (signData.code === 400 || /已签到|signed/i.test(signData.message || ""))) {
        $.setdata(today, "quark_last_sign");
        $.msg($.name, "✅ 今日已签到", `身份: ${vipStatus}\n容量: ${totalCap}`);
        signSuccess = true;
        break;
      }
    } catch (e) {
      $.log(`sign 接口失败: ${api}`);
      $.log(String(e));
    }
  }

  if (!signSuccess) {
    $.msg($.name, "❌ 签到失败", "所有签到接口均失败");
  }
}

/* ========================= 模拟浏览 ========================= */
async function fakeBrowse(queryString) {
  const urls = [];
  API.info.forEach(api => {
    urls.push(`${BASE_URL}${api}?${queryString}`);
  });
  if (Array.isArray(API.task)) {
    API.task.forEach(api => {
      urls.push(`${BASE_URL}${api}?${queryString}`);
    });
  }
  const randomUrl = urls[Math.floor(Math.random() * urls.length)];
  try {
    $.log("模拟浏览行为");
    await request(randomUrl);
  } catch (e) {
    $.log("模拟浏览结束");
  }
}

/* ========================= 参数过期检测 ========================= */
function checkExpired() {
  const refreshTime = Number($.getdata("quark_refresh_time") || 0);
  const now = Date.now();
  // 7天提醒
  if (now - refreshTime > 7 * 24 * 3600 * 1000) {
    $.msg($.name, "⚠️ 参数可能过期", "建议重新打开一次夸克网盘");
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
      $.log(`失败重试 ${i + 1}/${count}`);
      await randomSleep(2, 6);
    }
  }
  throw lastErr;
}

/* ========================= 请求封装 ========================= */
function request(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const cookie = $.getdata("quark_cookie") || "";
    let options = {
      url,
      timeout: 15000,
      headers: {
        "User-Agent": QUARK_UA,
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Connection": "keep-alive",
        "Origin": "https://b.quark.cn",
        "Referer": "https://b.quark.cn/",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "Cookie": cookie
      }
    };

    if (method === "POST") {
      options.body = body || "{}";
    }

    const callback = (err, resp, data) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        resolve(parsed || {});
      } catch (e) {
        $.log(`接口返回异常: ${String(data).slice(0, 120)}`);
        resolve({ code: -999, message: "返回异常" });
      }
    };

    if (method === "GET") {
      $.get(options, callback);
    } else {
      $.post(options, callback);
    }
  });
}

/* ========================= 随机等待 ========================= */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomSleep(min, max) {
  const sec = Math.floor(Math.random() * (max - min + 1)) + min;
  $.log(`随机等待 ${sec} 秒`);
  await sleep(sec * 1000);
}

/* ========================= 容量格式化 ========================= */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

/* ========================= Env 兼容层 (全局作用域) ========================= */
function Env(name) {
  this.name = name;
  this.isSurge = () => typeof $httpClient !== "undefined";
  this.isLoon = () => typeof $loon !== "undefined";
  this.isQX = () => typeof $task !== "undefined";
  
  this.getdata = (key) => {
    if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
    if (this.isQX()) return $prefs.valueForKey(key);
    return null;
  };
  
  this.setdata = (val, key) => {
    if (this.isSurge() || this.isLoon()) return $persistentStore.write(val, key);
    if (this.isQX()) return $prefs.setValueForKey(val, key);
    return false;
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
      $task.fetch(options).then(
        resp => callback(null, resp, resp.body),
        err => callback(err.error, null, null)
      );
    } else if (this.isSurge() || this.isLoon()) {
      $httpClient.get(options, (err, resp, body) => { callback(err, resp, body); });
    }
  };
  
  this.post = (options, callback) => {
    if (this.isQX()) {
      if (typeof options === "string") options = { url: options };
      options.method = "POST";
      $task.fetch(options).then(
        resp => callback(null, resp, resp.body),
        err => callback(err.error, null, null)
      );
    } else if (this.isSurge() || this.isLoon()) {
      $httpClient.post(options, (err, resp, body) => { callback(err, resp, body); });
    }
  };
  
  this.done = (val = {}) => {
    if (typeof $done !== "undefined") $done(val);
  };
}
