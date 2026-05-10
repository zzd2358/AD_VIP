/**
 * 京东Cookie提取脚本（严格防重复，兼容 Stash/Shadowrocket/Loon/QuanX/Surge）
 * @author NobyDa
 * @description 提取pt_key和pt_pin并发送通知，严格防重复
 */

var $ = new Env('京东Cookie提取');

function main() {
  if (typeof $request !== 'undefined') {
    extractJDCookie();
  } else {
    $.log('请在配置中设置请求拦截规则');
    $.done();
  }
}

function extractJDCookie() {
  try {
    const url = $request.url;
    const headers = $request.headers;

    if (isJDUrl(url)) {
      const cookie = headers['Cookie'] || headers['cookie'];

      if (cookie) {
        if (hasValidJDCookie(cookie)) {
          const ptKey = extractCookieValue(cookie, 'pt_key');
          const ptPin = extractCookieValue(cookie, 'pt_pin');

          if (ptKey && ptPin) { 
            const cookieFormatted = `pt_key=${ptKey};pt_pin=${ptPin};`;
            const cookieForDisplay = `pt_key=${ptKey}; pt_pin=${ptPin};`; 

            const lastCookie = $.read('jd_last_cookie');
            const lastNotificationTime = parseInt($.read('jd_last_notification_time') || '0'); 
            const currentTime = Math.floor(Date.now() / 1000);

            // Cookie变化了，立即通知
            if (lastCookie !== cookieFormatted) { 
              $.write(cookieFormatted, 'jd_last_cookie');
              $.write(currentTime.toString(), 'jd_last_notification_time');

              $.notify('京东Cookie获取成功',
                decodeURIComponent(ptPin),
                `完整Cookie:\n${cookieForDisplay}\n\n可直接复制使用`); 

              $.log('=========================================');
              $.log('✅ 京东Cookie提取成功');
              $.log(`👤 用户名: ${decodeURIComponent(ptPin)}`);
              $.log(`🔑 完整Cookie: ${cookieForDisplay}`);
              $.log('📋 格式化Cookie (可直接复制):');
              $.log(cookieFormatted);
              $.log('=========================================');
            }
            // Cookie没变化，但是距离上次通知已经超过15秒，再次通知
            else if ((currentTime - lastNotificationTime) >= 15) {
              $.write(currentTime.toString(), 'jd_last_notification_time');

              $.notify('京东Cookie获取成功 (未变化)', 
                decodeURIComponent(ptPin),
                `完整Cookie:\n${cookieForDisplay}\n\n可直接复制使用`); 

              $.log('=========================================');
              $.log('✅ 京东Cookie未变化，超过15秒再次通知');
              $.log(`👤 用户名: ${decodeURIComponent(ptPin)}`);
              $.log(`🔑 完整Cookie: ${cookieForDisplay}`);
              $.log('📋 格式化Cookie (可直接复制):');
              $.log(cookieFormatted);
              $.log('=========================================');
            } else {
              // 15秒内已通知过，且Cookie没变化，跳过
              $.log('⏳ 15秒内已通知过且Cookie未变化，跳过本次');
              $.log(`👤 当前用户: ${decodeURIComponent(ptPin)}`);
              $.log(`🔑 完整Cookie: ${cookieForDisplay}`);
            }
          } else {
            $.log('❌ 未能提取到完整的pt_key或pt_pin');
          }
        } else {
          $.log('❌ Cookie中未找到pt_key或pt_pin字段');
        }
      } else {
        $.log('❌ 请求头中未包含Cookie信息');
      }
    }

    $.done();
  } catch (error) {
    $.log(`❌ 提取Cookie失败: ${error.message}`);
    $.done(); 
  }
}

function isJDUrl(url) {
  return /(.*\.jd\.com|api\.m\.jd\.com|plogin\.m\.jd\.com|auth\.m\.jd\.com)/.test(url);
}

function hasValidJDCookie(cookie) {
  return cookie.indexOf('pt_key=') > -1 && cookie.indexOf('pt_pin=') > -1;
}

function extractCookieValue(cookieStr, key) {
  const regex = new RegExp(key + '=([^;]+)');
  const match = cookieStr.match(regex);
  return match ? match[1] : null;
}

// 增强的环境兼容 Env 类 (全面兼容 Stash / Shadowrocket / Loon / QuanX / Surge)
function Env(name) {
  this.name = name;
  const isQuanX = typeof $prefs !== 'undefined';
  const hasNotification = typeof $notification !== 'undefined';
  const hasPersistentStore = typeof $persistentStore !== 'undefined';

  this.log = (msg) => {
    console.log(`[${this.name}] ${msg}`);
  };

  this.done = (response = {}) => {
    if (typeof $done !== 'undefined') {
      $done(response); // 兼容 Stash 等所有平台的通用结束方法
    }
  };

  this.notify = (title, subtitle, message) => {
    if (isQuanX) {
      $notify(title, subtitle, message); 
    } else if (hasNotification) {
      // 兼容 Stash: $notification.post(title, subtitle, body)
      $notification.post(title, subtitle, message); 
    }
  };

  this.write = (value, key) => {
    if (isQuanX) {
      return $prefs.setValueForKey(value, key);
    } else if (hasPersistentStore) {
      // 兼容 Stash: $persistentStore.write(value, key)
      return $persistentStore.write(value, key); 
    }
  };

  this.read = (key) => {
    if (isQuanX) {
      return $prefs.valueForKey(key);
    } else if (hasPersistentStore) {
      // 兼容 Stash: $persistentStore.read(key)
      return $persistentStore.read(key); 
    }
    return null;
  };
}

main();
