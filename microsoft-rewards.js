/**
 * 微软积分商城签到 - Loon 主任务脚本
 *
 * 依赖项：
 *   capture_auth.js   → 自动捕获 OAuth code（MITM 拦截）
 *   capture_cookie.js → 自动捕获 Bing Cookie（MITM 拦截）
 *
 * 存储键（$persistentStore）：
 *   MSR_authCode      授权码链接（capture_auth.js 自动写入）
 *   MSR_refreshToken  Refresh Token（本脚本自动维护，无需手动设置）
 *   MSR_bingCookie    Bing Cookie（capture_cookie.js 自动写入）
 *   MSR_bingHost      Bing 主机，默认 cn.bing.com（可手动写入改为 www.bing.com）
 *   MSR_taskSign      是否启用签入，默认 true（写入字符串 "false" 可禁用）
 *   MSR_taskRead      是否启用阅读，默认 true
 *   MSR_taskPromos    是否启用活动，默认 true
 *   MSR_taskSearch    是否启用搜索，默认 true
 *   MSR_signDate      签入完成日期（自动维护）
 *   MSR_readDate      阅读完成日期（自动维护）
 *   MSR_promosDate    活动完成日期（自动维护）
 *   MSR_searchDate    搜索完成日期（自动维护）
 *   MSR_allDoneDate   全部完成通知日期（自动维护）
 *   MSR_signPoint     今日签入积分（自动维护）
 *   MSR_signDate2     签入积分记录日期（自动维护）
 */

'use strict';

// ==================== 工具函数 ====================

function pRead(key, def) {
  try {
    const raw = $persistentStore.read('MSR_' + key);
    if (raw === null || raw === undefined || raw === '') return def;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const n = Number(raw);
    if (!isNaN(n) && raw.trim() !== '') return n;
    return raw;
  } catch (e) { return def; }
}

function pWrite(key, val) {
  const s = (val === null || val === undefined) ? ''
    : (typeof val === 'object' ? JSON.stringify(val) : String(val));
  $persistentStore.write(s, 'MSR_' + key);
}

function log(tag, msg) {
  console.log('[MS积分' + tag + '] ' + msg);
}

function notify(title, sub, body) {
  $notification.post(title, sub, body);
  log(sub, body);
}

function genUUID(hexOnly) {
  const u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  return hexOnly ? u.replace(/-/g, '').toUpperCase() : u;
}

function todayNum() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return Number('' + d.getFullYear() + m + day);
}

function todaySlash() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear();
}

function todayHyphen() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function randRange(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function isJSON(s) {
  try {
    const j = JSON.parse(s);
    return typeof j === 'object' && j !== null;
  } catch (e) { return false; }
}

function encodeParams(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

function http(opt) {
  return new Promise(function (resolve, reject) {
    const req = { url: opt.url, headers: opt.headers || {} };
    if (opt.body || opt.data) req.body = opt.body || opt.data;
    function cb(err, res, data) {
      if (err) { reject(new Error(String(err))); return; }
      const s = res.status || res.statusCode || 0;
      if (s >= 200 && s < 300) { resolve({ status: s, data: data || '' }); return; }
      if (s >= 300 && s < 400) {
        const loc = (res.headers || {}).location || (res.headers || {}).Location || '';
        resolve({ status: s, data: loc });
        return;
      }
      reject(new Error('HTTP ' + s + ' → ' + opt.url.substring(0, 60)));
    }
    if ((opt.method || 'GET').toUpperCase() === 'POST') {
      $httpClient.post(req, cb);
    } else {
      $httpClient.get(req, cb);
    }
  });
}

// ==================== 常量 ====================

const UA = {
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.81',
  m: 'Mozilla/5.0 (Linux; Android 16; MCE16 Build/BP3A.250905.014; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36 EdgA/123.0.2420.102',
};

const TODAY = todayNum();
const TODAY_SLASH = todaySlash();
const TODAY_HYPHEN = todayHyphen();
const BING_HOST = pRead('bingHost', 'cn.bing.com');

const SEARCH_WORDS = [
  '天气预报', '今日新闻', '体育赛事', '股票行情', '电影推荐',
  '科技资讯', '美食食谱', '旅游攻略', '历史上的今天', '健康常识',
  '最新手机', '编程教程', '英语学习', '减肥方法', '理财知识',
  '汽车资讯', '房价走势', '教育政策', '新能源汽车', '人工智能',
  '足球直播', '篮球比赛', '股市分析', '基金收益', '网络安全',
  '云计算技术', '大数据分析', '区块链应用', '物联网发展', '元宇宙',
];

// ==================== Token 管理 ====================

let ACCESS_TOKEN = '';

async function getToken() {
  // 优先用 Refresh Token 续期
  const refreshToken = pRead('refreshToken', '');

  if (refreshToken) {
    log('🔑', 'Refresh Token 续期中...');
    try {
      const url = 'https://login.live.com/oauth20_token.srf' +
        '?client_id=0000000040170455' +
        '&refresh_token=' + encodeURIComponent(refreshToken) +
        '&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL' +
        '&grant_type=REFRESH_TOKEN';
      const res = await http({ url: url });
      if (res.data && isJSON(res.data)) {
        const j = JSON.parse(res.data);
        if (j.refresh_token && j.access_token) {
          pWrite('refreshToken', j.refresh_token);
          ACCESS_TOKEN = j.access_token;
          log('✅', 'Refresh Token 续期成功');
          return true;
        }
      }
      // Refresh Token 失效，清除并尝试用 Auth Code
      log('🟡', 'Refresh Token 已失效，清除并尝试 Auth Code...');
      pWrite('refreshToken', '');
    } catch (e) {
      log('🟡', 'Refresh Token 续期出错: ' + e.message + '，尝试 Auth Code...');
      pWrite('refreshToken', '');
    }
  }

  // 没有 Refresh Token，使用 Auth Code 换取
  const authCode = pRead('authCode', '');
  if (!authCode) {
    notify(
      '⚠️ 微软积分',
      '未获取到授权码',
      '请在浏览器中打开以下链接并登录，授权码将自动捕获：\nhttps://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf'
    );
    return false;
  }

  // 提取 code 字段（可能存的是完整链接也可能只是 code）
  const codeMatch = authCode.match(/M\.[^&\s]+/);
  if (!codeMatch) {
    notify('⚠️ 微软积分', '授权码格式不正确', '请重新打开授权链接，等待自动捕获。');
    pWrite('authCode', '');
    return false;
  }
  const code = codeMatch[0];

  log('🔑', '使用 Auth Code 换取 Token...');
  try {
    const url = 'https://login.live.com/oauth20_token.srf' +
      '?client_id=0000000040170455' +
      '&code=' + encodeURIComponent(code) +
      '&redirect_uri=https://login.live.com/oauth20_desktop.srf' +
      '&grant_type=authorization_code';
    const res = await http({ url: url });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      if (j.refresh_token && j.access_token) {
        pWrite('refreshToken', j.refresh_token);
        ACCESS_TOKEN = j.access_token;
        // Auth Code 一次性，用完立即清除
        pWrite('authCode', '');
        log('✅', 'Auth Code 换取 Token 成功，Refresh Token 已保存');
        return true;
      }
    }
    // Code 可能已过期或被用过
    pWrite('authCode', '');
    notify(
      '⚠️ 微软积分',
      '授权码已失效',
      '请重新打开以下链接获取新授权码（每次链接只能使用一次）：\nhttps://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf'
    );
  } catch (e) {
    log('🔴', 'Auth Code 换取 Token 出错: ' + e.message);
  }

  return false;
}

// ==================== 签入 ====================

async function taskSign() {
  if (pRead('signDate', 0) === TODAY) {
    log('✅', '今日签入已完成，跳过');
    return true;
  }
  log('📌', '执行签入任务...');
  try {
    const res = await http({
      method: 'POST',
      url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'user-agent': UA.m,
        'authorization': 'Bearer ' + ACCESS_TOKEN,
        'x-rewards-appid': 'SAAndroid/31.4.2110003555',
        'x-rewards-ismobile': 'true',
        'x-rewards-country': 'cn',
        'x-rewards-partnerid': 'startapp',
        'x-rewards-flights': 'rwgobig',
      },
      body: JSON.stringify({
        amount: 1, attributes: {}, id: genUUID(), type: 103,
        country: 'cn', risk_context: {}, channel: 'SAAndroid',
      }),
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      const point = (j.response && j.response.activity && j.response.activity.p) || 0;
      pWrite('signDate', TODAY);
      pWrite('signPoint', point);
      const msg = point > 0 ? '签入成功！获得 ' + point + ' 积分 ✨' : '今日已签入（无重复积分）';
      notify('🟣 微软积分', '签入完成', msg);
      return true;
    }
  } catch (e) {
    log('🔴', '签入任务出错: ' + e.message);
  }
  return false;
}

// ==================== 阅读 ====================

async function getReadProgress() {
  try {
    const res = await http({
      url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
      headers: {
        'user-agent': UA.m,
        'authorization': 'Bearer ' + ACCESS_TOKEN,
        'x-rewards-appid': 'SAAndroid/31.4.2110003555',
        'x-rewards-ismobile': 'true',
      },
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      const pro = (j.response && j.response.promotions) || [];
      for (let i = 0; i < pro.length; i++) {
        if (pro[i].attributes && pro[i].attributes.offerid === 'ENUS_readarticle3_30points') {
          return {
            max: Number(pro[i].attributes.max) || 30,
            progress: Number(pro[i].attributes.progress) || 0,
          };
        }
      }
    }
  } catch (e) {
    log('🔴', '阅读进度获取出错: ' + e.message);
  }
  return { max: 30, progress: 0 };
}

async function taskRead() {
  if (pRead('readDate', 0) === TODAY) {
    log('✅', '今日阅读已完成，跳过');
    return true;
  }
  log('📖', '执行阅读任务...');
  try {
    const prog = await getReadProgress();
    const cur = prog.progress;
    const max = prog.max || 30;
    if (cur >= max) {
      pWrite('readDate', TODAY);
      log('✅', '阅读进度已满 ' + cur + '/' + max);
      return true;
    }
    const needed = Math.ceil((max - cur) / 3);
    log('📖', '需阅读 ' + needed + ' 篇 (当前 ' + cur + '/' + max + ')');
    for (let i = 0; i < needed; i++) {
      await http({
        method: 'POST',
        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'user-agent': UA.m,
          'authorization': 'Bearer ' + ACCESS_TOKEN,
          'x-rewards-appid': 'SAAndroid/31.4.2110003555',
          'x-rewards-ismobile': 'true',
          'x-rewards-country': 'cn',
        },
        body: JSON.stringify({
          amount: 1, country: 'cn', id: genUUID(), type: 101,
          attributes: { offerid: 'ENUS_readarticle3_30points' },
        }),
      });
      log('📖', '第 ' + (i + 1) + '/' + needed + ' 篇完成');
      if (i < needed - 1) await sleep(randRange(3000, 6000));
    }
    pWrite('readDate', TODAY);
    notify('🟣 微软积分', '阅读完成', '今日阅读奖励 ' + max + ' 积分 ✨');
    return true;
  } catch (e) {
    log('🔴', '阅读任务出错: ' + e.message);
  }
  return false;
}

// ==================== 活动 ====================

async function getRewardsInfo(cookie) {
  try {
    const res = await http({
      url: 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=' + Date.now(),
      headers: {
        'referer': 'https://rewards.bing.com/',
        'user-agent': UA.pc,
        'cookie': cookie,
      },
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      return (j && j.dashboard) || null;
    }
  } catch (e) {
    log('🔴', 'Rewards 信息获取出错: ' + e.message);
  }
  return null;
}

async function getReqToken(cookie) {
  try {
    const res = await http({
      url: 'https://rewards.bing.com/',
      headers: { 'user-agent': UA.pc, 'cookie': cookie },
    });
    const clean = res.data.replace(/\s/g, '');
    const m = clean.match(/RequestVerificationToken[^>]*?value="([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) {
    log('🔴', 'ReqToken 获取出错: ' + e.message);
    return null;
  }
}

async function taskPromos(cookie) {
  if (pRead('promosDate', 0) === TODAY) {
    log('✅', '今日活动已完成，跳过');
    return true;
  }
  if (!cookie) {
    log('🟡', '无 Bing Cookie，跳过活动任务');
    return true;
  }
  log('🎯', '执行活动任务...');
  try {
    const dashboard = await getRewardsInfo(cookie);
    if (!dashboard) {
      notify('⚠️ 微软积分', 'Bing Cookie 已失效', '请用浏览器访问 rewards.bing.com 重新登录，Cookie 将自动捕获。');
      // 清除失效 Cookie
      pWrite('bingCookie', '');
      return false;
    }
    if (dashboard.isSuspended || (dashboard.userStatus && dashboard.userStatus.isSuspended)) {
      notify('🔴 微软积分', '账号被暂停', '已停止所有任务！');
      return true;
    }
    const reqToken = await getReqToken(cookie);
    if (!reqToken) { log('🟡', '无法获取 reqToken，跳过'); return false; }

    const morePromos = Array.isArray(dashboard.morePromotions) ? dashboard.morePromotions : [];
    const dailySet = Array.isArray(dashboard.dailySetPromotions && dashboard.dailySetPromotions[TODAY_SLASH])
      ? dashboard.dailySetPromotions[TODAY_SLASH] : [];

    let promoPoints = 0, promoMax = 0;
    const todo = [];
    const all = dailySet.concat(morePromos);
    for (let i = 0; i < all.length; i++) {
      const item = all[i];
      if (item.priority > -2 && item.exclusiveLockedFeatureStatus !== 'locked') {
        const maxPt = parseInt(item.pointProgressMax) || 0;
        let curPt = parseInt(item.pointProgress) || 0;
        if (item.complete && curPt === 0) curPt = maxPt;
        promoMax += maxPt;
        promoPoints += curPt;
        if (!item.complete) todo.push({ id: item.offerId, hash: item.hash || '', url: item.destinationUrl || 'https://rewards.bing.com/' });
      }
    }

    if (todo.length === 0) {
      pWrite('promosDate', TODAY);
      notify('🟣 微软积分', '活动完成', '今日活动奖励 ' + promoPoints + '/' + promoMax + ' 积分 ✨');
      return true;
    }
    log('🎯', '待完成活动 ' + todo.length + ' 个，进度 ' + promoPoints + '/' + promoMax);
    for (let i = 0; i < todo.length; i++) {
      try {
        await http({
          method: 'POST',
          url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
          headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'referer': todo[i].url,
            'user-agent': UA.pc,
            'cookie': cookie,
          },
          body: encodeParams({
            id: todo[i].id, hash: todo[i].hash, timeZone: 480,
            activityAmount: 1, dbs: 0, form: '', type: '',
            __RequestVerificationToken: reqToken,
          }),
        });
        log('🎯', '活动 ' + (i + 1) + '/' + todo.length + ' 上报完成');
      } catch (e) {
        log('🟡', '活动 ' + (i + 1) + ' 上报失败: ' + e.message);
      }
      if (i < todo.length - 1) await sleep(randRange(1500, 3000));
    }
    pWrite('promosDate', TODAY);
    notify('🟣 微软积分', '活动完成', '共完成 ' + todo.length + ' 个活动 ✨');
    return true;
  } catch (e) {
    log('🔴', '活动任务出错: ' + e.message);
  }
  return false;
}

// ==================== 搜索 ====================

async function taskSearch(cookie) {
  if (pRead('searchDate', 0) === TODAY) {
    log('✅', '今日搜索已完成，跳过');
    return true;
  }
  if (!cookie) {
    log('🟡', '无 Bing Cookie，跳过搜索任务');
    return true;
  }
  log('🔍', '执行搜索任务...');

  const dashboard = await getRewardsInfo(cookie);
  if (!dashboard) {
    notify('⚠️ 微软积分', 'Bing Cookie 已失效', '请用浏览器访问 rewards.bing.com 重新登录，Cookie 将自动捕获。');
    pWrite('bingCookie', '');
    return false;
  }

  const counters = (dashboard.userStatus && dashboard.userStatus.counters) || {};
  let pcPro = (counters.pcSearch && counters.pcSearch[0] && counters.pcSearch[0].pointProgress) || 0;
  let pcMax = (counters.pcSearch && counters.pcSearch[0] && counters.pcSearch[0].pointProgressMax) || 60;
  let mPro  = (counters.mobileSearch && counters.mobileSearch[0] && counters.mobileSearch[0].pointProgress) || 0;
  let mMax  = (counters.mobileSearch && counters.mobileSearch[0] && counters.mobileSearch[0].pointProgressMax) || 0;
  if (pcMax === 0) pcMax = 60;

  log('🔍', '当前: PC ' + pcPro + '/' + pcMax + ' | 移动 ' + mPro + '/' + mMax);

  if (pcPro >= pcMax && mPro >= mMax) {
    pWrite('searchDate', TODAY);
    notify('🟣 微软积分', '搜索完成', 'PC ' + pcPro + '/' + pcMax + ' | 移动 ' + mPro + '/' + mMax + ' ✨');
    return true;
  }

  // 每次执行搜索若干次，未完成则下次 cron 继续
  const limit = randRange(5, 8);
  log('🔍', '本次计划搜索 ' + limit + ' 次...');

  for (let i = 0; i < limit; i++) {
    const keyword = SEARCH_WORDS[randInt(SEARCH_WORDS.length)] + ' ' + Math.random().toString(36).slice(2, 5);

    // 动态决定设备类型
    let usePC = Math.random() > 0.4;
    if (pcPro >= pcMax) usePC = false;
    if (mMax > 0 && mPro >= mMax) usePC = true;

    const ua = usePC ? UA.pc : UA.m;
    const rwho = usePC ? ('u=d&ts=' + TODAY_HYPHEN) : ('u=m&ts=' + TODAY_HYPHEN);
    const params = 'q=' + encodeURIComponent(keyword) + '&form=QBLH&mkt=zh-CN';
    const searchUrl = 'https://' + BING_HOST + '/search?' + params;

    try {
      const res = await http({
        url: searchUrl,
        headers: {
          'user-agent': ua,
          'cookie': cookie + '; _Rwho=' + rwho,
          'referer': 'https://' + BING_HOST + '/',
        },
      });
      if (res.data) {
        const clean = res.data.replace(/\s/g, '');
        const igM = clean.match(/,IG:"([^"]+)"/);
        const guid = igM ? igM[1] : genUUID(true);
        const baseH = { 'user-agent': ua, 'cookie': cookie + '; _Rwho=' + rwho, 'referer': searchUrl };
        // 上报积分（忽略失败）
        try {
          await http({ method: 'POST', url: 'https://' + BING_HOST + '/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=' + guid + '&ajaxreq=1', headers: baseH, body: 'wb=1%3bi%3d1%3bv%3d1' });
        } catch (e) {}
        try {
          await http({ method: 'POST', url: 'https://' + BING_HOST + '/rewardsapp/reportActivity?IG=' + guid + '&IID=SERP.5047&' + params + '&ajaxreq=1', headers: baseH, body: 'url=' + encodeURIComponent(searchUrl) + '&V=web' });
        } catch (e) {}
      }
      log('🔍', '第 ' + (i + 1) + '/' + limit + ' 次 (' + (usePC ? 'PC' : '移动') + '): ' + keyword);
    } catch (e) {
      log('🟡', '搜索出错: ' + e.message);
    }

    if (i < limit - 1) {
      const wait = randRange(20000, 40000);
      log('⏳', '等待 ' + Math.round(wait / 1000) + 's...');
      await sleep(wait);
    }
  }

  // 再次检查进度
  try {
    const d2 = await getRewardsInfo(cookie);
    if (d2) {
      const c2 = (d2.userStatus && d2.userStatus.counters) || {};
      const pc2  = (c2.pcSearch && c2.pcSearch[0] && c2.pcSearch[0].pointProgress) || 0;
      const pcM2 = (c2.pcSearch && c2.pcSearch[0] && c2.pcSearch[0].pointProgressMax) || pcMax;
      const m2   = (c2.mobileSearch && c2.mobileSearch[0] && c2.mobileSearch[0].pointProgress) || 0;
      const mM2  = (c2.mobileSearch && c2.mobileSearch[0] && c2.mobileSearch[0].pointProgressMax) || mMax;
      log('🔍', '更新后: PC ' + pc2 + '/' + pcM2 + ' | 移动 ' + m2 + '/' + mM2);
      if (pc2 >= pcM2 && m2 >= mM2) {
        pWrite('searchDate', TODAY);
        notify('🟣 微软积分', '搜索完成', 'PC ' + pc2 + '/' + pcM2 + ' | 移动 ' + m2 + '/' + mM2 + ' ✨');
        return true;
      }
    }
  } catch (e) {}

  log('🔵', '搜索任务未完成，下次 cron 继续');
  return false;
}

// ==================== 主函数 ====================

async function main() {
  log('🚀', '启动，日期 ' + TODAY);

  const bingCookie = pRead('bingCookie', '');
  const sw = {
    sign:   pRead('taskSign',   true),
    read:   pRead('taskRead',   true),
    promos: pRead('taskPromos', true),
    search: pRead('taskSearch', true),
  };

  // 签入 & 阅读（需要 Access Token）
  if (sw.sign || sw.read) {
    const ok = await getToken();
    if (ok) {
      if (sw.sign) await taskSign();
      if (sw.read) await taskRead();
    } else {
      log('🟡', 'Token 获取失败，签入/阅读任务跳过');
    }
  }

  // 活动 & 搜索（需要 Bing Cookie）
  if (sw.promos) await taskPromos(bingCookie);
  if (sw.search) await taskSearch(bingCookie);

  // 全部完成汇报
  const done = {
    sign:   !sw.sign   || pRead('signDate',   0) === TODAY,
    read:   !sw.read   || pRead('readDate',   0) === TODAY,
    promos: !sw.promos || pRead('promosDate', 0) === TODAY,
    search: !sw.search || pRead('searchDate', 0) === TODAY,
  };

  if (done.sign && done.read && done.promos && done.search) {
    const lastAll = pRead('allDoneDate', 0);
    if (lastAll !== TODAY) {
      pWrite('allDoneDate', TODAY);

      let summary = '今日所有任务已全部完成！\n';
      if (bingCookie) {
        try {
          const d = await getRewardsInfo(bingCookie);
          if (d && d.userStatus) {
            const avail = d.userStatus.availablePoints || 0;
            const todayPts = (d.userStatus.counters && d.userStatus.counters.dailyPoint
              && d.userStatus.counters.dailyPoint[0]
              && d.userStatus.counters.dailyPoint[0].pointProgress) || 0;
            summary += '✨ 今日积分: +' + todayPts + '\n💰 总积分: ' + avail;
          }
        } catch (e) {}
      }
      notify('🎉 微软积分', '全部完成！', summary);
    } else {
      log('💤', '今日任务已完成，保持休眠');
    }
  }

  log('✅', '本次执行结束');
}

main().catch(function (e) {
  notify('🔴 微软积分', '脚本异常', e.message);
}).finally(function () {
  $done();
});
