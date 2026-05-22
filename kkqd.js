/*
夸克网盘自动签到 - 真长期稳定防风控版 (已修复版)
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
const QUARK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X; zh-cn) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/19C56 Quark/10.9.5.3027 Mobile";

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
    await randomSleep(1, 3);
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

  // 兼容大小写 Cookie 键名
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
    $.msg($.name, "参数抓取成功", "Cookie / kps / sign / vcode 已更新");
  }
}

/* ========================= 主签到 ========================= */

async function doSign() {
  const cookie = $.getdata("quark_cookie");
  const kps = $.getdata("quark_kps");
  const sign = $.getdata("quark_sign");
  const vcode = $.getdata("quark_vcode");

  if (!cookie || !kps || !sign || !vcode) {
    $.msg($.name, "缺少参数", "请先打开夸克网盘完成抓包");
    return;
  }

  checkExpired();

  const headers = buildHeaders(cookie);

  let infoData = null;

  for (const path of API.info) {
    try {
      const url =
        BASE_URL +
        path +
        `?pr=ucpro&fr=pc&kps=${encodeURIComponent(kps)}&sign=${encodeURIComponent(sign)}&vcode=${encodeURIComponent(vcode)}`;

      $.log(`查询信息接口: ${path}`);

      const resp = await request({
        url,
        method: "GET",
        headers
      });

      const data = parseJSONSafe(resp.body);

      if (data && data.data) {
        infoData = data.data;
        break;
      }
    } catch (e) {
      $.log(`信息接口失败: ${e}`);
    }
  }

  if (!infoData) {
    $.msg($.name, "获取签到信息失败", "Cookie 可能失效");
    return;
  }

  if (infoData.cap_sign && infoData.cap_sign.sign_daily) {
    const reward =
      infoData.cap_sign.sign_daily_reward || 0;

    $.msg(
      $.name,
      "今日已签到",
      `已获得 ${reward} MB`
    );

    return;
  }

  await randomSleep(1, 3);

  let signSuccess = false;
  let rewardText = "";

  for (const path of API.sign) {
    try {
      const url =
        BASE_URL +
        path +
        `?pr=ucpro&fr=pc&kps=${encodeURIComponent(kps)}&sign=${encodeURIComponent(sign)}&vcode=${encodeURIComponent(vcode)}`;

      $.log(`签到接口: ${path}`);

      // 签到通常需要声明 content-type
      const signHeaders = { ...headers, "Content-Type": "application/json" };

      const resp = await request({
        url,
        method: "POST",
        headers: signHeaders,
        body: "{}"
      });

      const data = parseJSONSafe(resp.body);

      if (data && (data.code === 0 || data.status === 200)) {
        signSuccess = true;

        const reward =
          data.data?.sign_daily_reward ||
          data.data?.reward ||
          0;

        rewardText = `签到成功，获得 ${reward} MB`;

        break;
      } else {
        $.log(`接口返回: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      $.log(`签到失败: ${e}`);
    }
  }

  if (signSuccess) {
    $.msg($.name, "签到成功", rewardText);
  } else {
    $.msg($.name, "签到失败", "可能触发风控，请稍后重试");
  }
}

/* ========================= 过期检测 ========================= */

function checkExpired() {
  const refreshTime = Number($.getdata("quark_refresh_time") || 0);

  // 首次运行避免直接误判
  if (!refreshTime) {
    $.log("未发现 refresh_time，跳过过期检测");
    return false;
  }

  const now = Date.now();

  if (now - refreshTime > 7 * 24 * 3600 * 1000) {
    $.msg(
      $.name,
      "⚠️ 参数可能过期",
      "建议重新打开一次夸克网盘"
    );
    return true;
  }

  return false;
}

/* ========================= 请求封装 ========================= */

// 修复点：直接调用方法，防止丢失 `this` 上下文指向
function request(options) {
  return new Promise((resolve, reject) => {
    const isPost = (options.method || "GET").toUpperCase() === "POST";
    
    if (isPost) {
      $.post(options, (err, resp, data) => {
        if (err) reject(err);
        else resolve({ resp, body: data });
      });
    } else {
      $.get(options, (err, resp, data) => {
        if (err) reject(err);
        else resolve({ resp, body: data });
      });
    }
  });
}

/* ========================= JSON 容错 ========================= */

function parseJSONSafe(data) {
  if (!data) return {};
  if (typeof data === "object") return data;

  try {
    return JSON.parse(data);
  } catch (_) {
    try {
      if (typeof data === "string") {
        return JSON.parse(data.trim());
      }
    } catch (e) {
      $.log(`JSON 解析失败: ${e}`);
    }
  }

  return {};
}

/* ========================= Header ========================= */

function buildHeaders(cookie) {
  return {
    "Cookie": cookie,
    "User-Agent": QUARK_UA,
    "Referer": "https://b.quark.cn/",
    "Origin": "https://b.quark.cn",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh-Hans;q=1",
    "Connection": "keep-alive"
  };
}

/* ========================= 随机延迟 ========================= */

async function randomSleep(min, max) {
  const sec =
    Math.floor(Math.random() * (max - min + 1)) + min;

  $.log(`随机延迟 ${sec} 秒`);

  return new Promise((resolve) =>
    setTimeout(resolve, sec * 1000)
  );
}

/* ========================= Env ========================= */

function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.data = null;
      this.logs = [];
      this.isSurge = () => typeof $httpClient !== "undefined";
      this.isQuanX = () => typeof $task !== "undefined";
      this.isLoon = () => typeof $loon !== "undefined";
      this.isNode = () => typeof module !== "undefined";
      this.log("", `🔔${this.name}, 开始!`);
    }

    getdata(key) {
      if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
      if (this.isQuanX()) return $prefs.valueForKey(key);
      return null;
    }

    setdata(val, key) {
      if (this.isSurge() || this.isLoon()) return $persistentStore.write(val, key);
      if (this.isQuanX()) return $prefs.setValueForKey(val, key);
      return null;
    }

    msg(title = name, subt = "", desc = "") {
      if (this.isSurge() || this.isLoon()) $notification.post(title, subt, desc);
      else if (this.isQuanX()) $notify(title, subt, desc);
      else console.log(`${title}\n${subt}\n${desc}`);
    }

    log(...logs) {
      console.log(logs.join("\n"));
    }

    logErr(err) {
      console.log(err);
    }

    get(options, callback) {
      if (this.isQuanX()) {
        if (typeof options === "string") options = { url: options };
        options.method = "GET";
        $task.fetch(options).then(
          (resp) => callback(null, resp, resp.body),
          (err) => callback(err)
        );
      } else {
        $httpClient.get(options, callback);
      }
    }

    post(options, callback) {
      if (this.isQuanX()) {
        if (typeof options === "string") options = { url: options };
        options.method = "POST";
        $task.fetch(options).then(
          (resp) => callback(null, resp, resp.body),
          (err) => callback(err)
        );
      } else {
        $httpClient.post(options, callback);
      }
    }

    done(val = {}) {
      this.log("", `🔔${this.name}, 结束!`);
      if (typeof $done !== "undefined") $done(val);
    }
  })(name);
}
