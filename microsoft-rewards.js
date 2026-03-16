/**
 * 微软积分商城签到 - Loon 主任务脚本
 *
 * 搜索策略：
 *   移动端搜索 → Bearer Token + dapi 接口（和签入/阅读同一套，最稳定）
 *   PC 端搜索  → Bing Cookie 模拟请求（备用）
 *
 * 存储键（$persistentStore，键名前缀 MSR_）：
 *   authCode      授权码链接（手动粘贴一次）
 *   refreshToken  Refresh Token（自动维护）
 *   bingCookie    Bing Cookie（capture_cookie.js 自动写入）
 *   bingHost      Bing 主机，默认 cn.bing.com
 *   taskSign      是否启用签入，默认 true
 *   taskRead      是否启用阅读，默认 true
 *   taskPromos    是否启用活动，默认 true
 *   taskSearch    是否启用搜索，默认 true
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
    if (!isNaN(n) && String(raw).trim() !== '') return n;
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
  const m   = String(d.getMonth() + 1).padStart(2, '0');
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

function randRange(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randInt(n) { return Math.floor(Math.random() * n); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function isJSON(s) {
  try { const j = JSON.parse(s); return typeof j === 'object' && j !== null; }
  catch (e) { return false; }
}

function encodeParams(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

// 从 Cookie 字符串中移除指定键（避免追加时冲突）
function stripCookieKeys(cookie, keys) {
  let r = cookie;
  keys.forEach(function (k) {
    r = r.replace(new RegExp('(^|;\\s*)' + k + '=[^;]*(;|$)', 'g'), '$3');
  });
  return r.replace(/^;\s*/, '').replace(/;\s*;/g, ';').replace(/;\s*$/, '').trim();
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
  m:  'Mozilla/5.0 (Linux; Android 16; MCE16 Build/BP3A.250905.014; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36 EdgA/123.0.2420.102',
};

const TODAY        = todayNum();
const TODAY_SLASH  = todaySlash();
const TODAY_HYPHEN = todayHyphen();
const BING_HOST    = String(pRead('bingHost', 'cn.bing.com'));

const SEARCH_WORDS = [
  '天气预报','今日新闻','体育赛事','股票行情','电影推荐',
  '科技资讯','美食食谱','旅游攻略','历史上的今天','健康常识',
  '最新手机','编程教程','英语学习','减肥方法','理财知识',
  '汽车资讯','房价走势','教育政策','新能源汽车','人工智能',
  '足球直播','篮球比赛','股市分析','基金收益','网络安全',
  '云计算','大数据','机器学习','深度学习','元宇宙',
  '量子计算','自动驾驶','智能家居','可再生能源','碳中和',
];

// ==================== Token 管理 ====================

let ACCESS_TOKEN = '';

async function getToken() {
  const refreshToken = String(pRead('refreshToken', ''));

  if (refreshToken) {
    log('🔑', 'Refresh Token 续期...');
    try {
      const res = await http({
        url: 'https://login.live.com/oauth20_token.srf' +
          '?client_id=0000000040170455' +
          '&refresh_token=' + encodeURIComponent(refreshToken) +
          '&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL' +
          '&grant_type=REFRESH_TOKEN',
      });
      if (res.data && isJSON(res.data)) {
        const j = JSON.parse(res.data);
        if (j.refresh_token && j.access_token) {
          pWrite('refreshToken', j.refresh_token);
          ACCESS_TOKEN = j.access_token;
          log('✅', 'Token 续期成功');
          return true;
        }
      }
      log('🟡', 'Refresh Token 失效，清除并尝试 Auth Code...');
      pWrite('refreshToken', '');
    } catch (e) {
      log('🟡', 'Token 续期出错: ' + e.message);
      pWrite('refreshToken', '');
    }
  }

  const authCode = String(pRead('authCode', ''));
  if (!authCode) {
    notify('⚠️ 微软积分', '需要授权码', '请参照说明获取授权码并写入 MSR_authCode');
    return false;
  }
  const codeMatch = authCode.match(/M\.[^&\s]+/);
  if (!codeMatch) {
    notify('⚠️ 微软积分', '授权码格式错误', '请重新获取并写入 MSR_authCode');
    pWrite('authCode', '');
    return false;
  }

  log('🔑', '使用 Auth Code 换取 Token...');
  try {
    const res = await http({
      url: 'https://login.live.com/oauth20_token.srf' +
        '?client_id=0000000040170455' +
        '&code=' + encodeURIComponent(codeMatch[0]) +
        '&redirect_uri=https://login.live.com/oauth20_desktop.srf' +
        '&grant_type=authorization_code',
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      if (j.refresh_token && j.access_token) {
        pWrite('refreshToken', j.refresh_token);
        pWrite('authCode', '');
        ACCESS_TOKEN = j.access_token;
        log('✅', 'Auth Code 换取成功，Refresh Token 已保存');
        return true;
      }
    }
    pWrite('authCode', '');
    notify('⚠️ 微软积分', '授权码已失效', '请重新获取授权码并写入 MSR_authCode');
  } catch (e) {
    log('🔴', 'Auth Code 换取出错: ' + e.message);
  }
  return false;
}

// ==================== 签入 ====================

async function taskSign() {
  if (pRead('signDate', 0) === TODAY) { log('✅', '今日签入已完成，跳过'); return true; }
  log('📌', '执行签入...');
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
        amount: 1, attributes: {}, id: genUUID(),
        type: 103, country: 'cn', risk_context: {}, channel: 'SAAndroid',
      }),
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      const pt = (j.response && j.response.activity && j.response.activity.p) || 0;
      pWrite('signDate', TODAY);
      pWrite('signPoint', pt);
      notify('🟣 微软积分', '签入完成', pt > 0 ? '获得 ' + pt + ' 积分 ✨' : '今日已签入');
      return true;
    }
  } catch (e) { log('🔴', '签入出错: ' + e.message); }
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
          return { max: Number(pro[i].attributes.max) || 30, progress: Number(pro[i].attributes.progress) || 0 };
        }
      }
    }
  } catch (e) { log('🔴', '阅读进度获取出错: ' + e.message); }
  return { max: 30, progress: 0 };
}

async function taskRead() {
  if (pRead('readDate', 0) === TODAY) { log('✅', '今日阅读已完成，跳过'); return true; }
  log('📖', '执行阅读...');
  try {
    const prog = await getReadProgress();
    const cur = prog.progress, max = prog.max || 30;
    if (cur >= max) { pWrite('readDate', TODAY); log('✅', '阅读进度已满'); return true; }
    const needed = Math.ceil((max - cur) / 3);
    log('📖', '需阅读 ' + needed + ' 篇（当前 ' + cur + '/' + max + '）');
    for (let i = 0; i < needed; i++) {
      try {
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
      } catch (e) { log('🟡', '第 ' + (i + 1) + ' 篇失败: ' + e.message); }
      if (i < needed - 1) await sleep(randRange(3000, 6000));
    }
    pWrite('readDate', TODAY);
    notify('🟣 微软积分', '阅读完成', '今日阅读奖励 ' + max + ' 积分 ✨');
    return true;
  } catch (e) { log('🔴', '阅读出错: ' + e.message); }
  return false;
}

// ==================== 活动 ====================

async function getRewardsInfo(cookie) {
  try {
    const res = await http({
      url: 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=' + Date.now(),
      headers: { 'referer': 'https://rewards.bing.com/', 'user-agent': UA.pc, 'cookie': cookie },
    });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      return (j && j.dashboard) || null;
    }
  } catch (e) { log('🔴', 'Rewards 信息获取出错: ' + e.message); }
  return null;
}

async function getReqToken(cookie) {
  try {
    const res = await http({ url: 'https://rewards.bing.com/', headers: { 'user-agent': UA.pc, 'cookie': cookie } });
    const m = res.data.replace(/\s/g, '').match(/RequestVerificationToken[^>]*?value="([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) { log('🔴', 'ReqToken 出错: ' + e.message); return null; }
}

async function taskPromos(cookie) {
  if (pRead('promosDate', 0) === TODAY) { log('✅', '今日活动已完成，跳过'); return true; }
  if (!cookie) { log('🟡', '无 Cookie，跳过活动'); return true; }
  log('🎯', '执行活动...');
  try {
    const dashboard = await getRewardsInfo(cookie);
    if (!dashboard) {
      notify('⚠️ 微软积分', 'Cookie 失效', '请访问 rewards.bing.com 重新登录');
      pWrite('bingCookie', '');
      return false;
    }
    if (dashboard.isSuspended || (dashboard.userStatus && dashboard.userStatus.isSuspended)) {
      notify('🔴 微软积分', '账号被暂停', '已停止所有任务');
      return true;
    }
    const reqToken = await getReqToken(cookie);
    if (!reqToken) { log('🟡', '无法获取 reqToken'); return false; }

    const morePromos = Array.isArray(dashboard.morePromotions) ? dashboard.morePromotions : [];
    const dailySet   = Array.isArray(dashboard.dailySetPromotions && dashboard.dailySetPromotions[TODAY_SLASH])
      ? dashboard.dailySetPromotions[TODAY_SLASH] : [];

    let promoPoints = 0, promoMax = 0;
    const todo = [];
    dailySet.concat(morePromos).forEach(function (item) {
      if (item.priority > -2 && item.exclusiveLockedFeatureStatus !== 'locked') {
        const maxPt = parseInt(item.pointProgressMax) || 0;
        let curPt = parseInt(item.pointProgress) || 0;
        if (item.complete && curPt === 0) curPt = maxPt;
        promoMax += maxPt; promoPoints += curPt;
        if (!item.complete) todo.push({ id: item.offerId, hash: item.hash || '', url: item.destinationUrl || 'https://rewards.bing.com/' });
      }
    });

    if (todo.length === 0) {
      pWrite('promosDate', TODAY);
      notify('🟣 微软积分', '活动完成', '今日活动奖励 ' + promoPoints + '/' + promoMax + ' 积分 ✨');
      return true;
    }
    log('🎯', '待完成 ' + todo.length + ' 个，进度 ' + promoPoints + '/' + promoMax);
    for (let i = 0; i < todo.length; i++) {
      try {
        await http({
          method: 'POST',
          url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'referer': todo[i].url, 'user-agent': UA.pc, 'cookie': cookie },
          body: encodeParams({ id: todo[i].id, hash: todo[i].hash, timeZone: 480, activityAmount: 1, dbs: 0, form: '', type: '', __RequestVerificationToken: reqToken }),
        });
        log('🎯', '活动 ' + (i + 1) + '/' + todo.length + ' 完成');
      } catch (e) { log('🟡', '活动 ' + (i + 1) + ' 失败: ' + e.message); }
      if (i < todo.length - 1) await sleep(randRange(1500, 3000));
    }
    pWrite('promosDate', TODAY);
    notify('🟣 微软积分', '活动完成', '共完成 ' + todo.length + ' 个活动 ✨');
    return true;
  } catch (e) { log('🔴', '活动出错: ' + e.message); }
  return false;
}

// ==================== 搜索 ====================
//
//  移动端搜索：Bearer Token + dapi/me/activities（type=1）
//             与签入/阅读完全相同的接口，不依赖 Cookie 和浏览器，稳定可靠
//
//  PC 端搜索：Bing Cookie 模拟浏览器请求（次选，非浏览器环境效果有限）

async function doMobileSearch(totalNeeded) {
  // totalNeeded = 距离满分还需要的积分数
  // 每次 POST 给 3 积分，所以请求次数 = ceil(totalNeeded / 3)
  const count = Math.min(Math.ceil(totalNeeded / 3), 12); // 单次最多12次
  log('📱', '移动端搜索 ' + count + ' 次（约 ' + (count * 3) + ' 积分）...');
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const kw = SEARCH_WORDS[randInt(SEARCH_WORDS.length)] + ' ' + Math.random().toString(36).slice(2, 5);
    try {
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
          'x-rewards-partnerid': 'Bing.BingMobileApp',
        },
        body: JSON.stringify({
          amount: 1,
          id: genUUID(),
          type: 1,           // Bing 移动搜索活动类型
          country: 'cn',
          channel: 'SAAndroid',
          attributes: { q: kw, source: 'Bing.BingMobileApp' },
          risk_context: {},
        }),
      });
      ok++;
      log('📱', '移动搜索 ' + (i + 1) + '/' + count + '：' + kw);
    } catch (e) {
      log('🟡', '移动搜索 ' + (i + 1) + ' 失败: ' + e.message);
    }
    if (i < count - 1) await sleep(randRange(4000, 8000));
  }
  return ok;
}

async function doPCSearch(cookie, totalNeeded) {
  const count = Math.min(Math.ceil(totalNeeded / 3), 8);
  log('💻', 'PC搜索 ' + count + ' 次...');
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const kw     = SEARCH_WORDS[randInt(SEARCH_WORDS.length)] + ' ' + Math.random().toString(36).slice(2, 5);
    const params = 'q=' + encodeURIComponent(kw) + '&form=QBLH&mkt=zh-CN';
    const url    = 'https://' + BING_HOST + '/search?' + params;
    const ck     = stripCookieKeys(cookie, ['_Rwho', '_EDGE_S', '_RwBf']) + '; _Rwho=u=d&ts=' + TODAY_HYPHEN;
    try {
      const res = await http({ url: url, headers: { 'user-agent': UA.pc, 'cookie': ck, 'referer': 'https://' + BING_HOST + '/', 'accept-language': 'zh-CN,zh;q=0.9' } });
      if (res.data) {
        const igM  = res.data.replace(/\s/g, '').match(/,IG:"([^"]+)"/);
        const guid = igM ? igM[1] : genUUID(true);
        const h    = { 'user-agent': UA.pc, 'cookie': ck, 'referer': url };
        try { await http({ method: 'POST', url: 'https://' + BING_HOST + '/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=' + guid + '&ajaxreq=1', headers: h, body: 'wb=1%3bi%3d1%3bv%3d1' }); } catch (e) {}
        try { await http({ method: 'POST', url: 'https://' + BING_HOST + '/rewardsapp/reportActivity?IG=' + guid + '&IID=SERP.5047&' + params + '&ajaxreq=1', headers: h, body: 'url=' + encodeURIComponent(url) + '&V=web' }); } catch (e) {}
        ok++;
        log('💻', 'PC搜索 ' + (i + 1) + '/' + count + '：' + kw);
      }
    } catch (e) { log('🟡', 'PC搜索 ' + (i + 1) + ' 失败: ' + e.message); }
    if (i < count - 1) {
      const w = randRange(20000, 40000);
      log('⏳', '等待 ' + Math.round(w / 1000) + 's...');
      await sleep(w);
    }
  }
  return ok;
}

async function taskSearch(cookie) {
  if (pRead('searchDate', 0) === TODAY) { log('✅', '今日搜索已完成，跳过'); return true; }
  log('🔍', '执行搜索...');

  // 获取进度
  let pcPro = 0, pcMax = 60, mPro = 0, mMax = 0;
  if (cookie) {
    const db = await getRewardsInfo(cookie);
    if (db) {
      const c  = (db.userStatus && db.userStatus.counters) || {};
      pcPro = (c.pcSearch     && c.pcSearch[0]     && Number(c.pcSearch[0].pointProgress))    || 0;
      pcMax = (c.pcSearch     && c.pcSearch[0]     && Number(c.pcSearch[0].pointProgressMax)) || 60;
      mPro  = (c.mobileSearch && c.mobileSearch[0] && Number(c.mobileSearch[0].pointProgress))    || 0;
      mMax  = (c.mobileSearch && c.mobileSearch[0] && Number(c.mobileSearch[0].pointProgressMax)) || 0;
      if (pcMax === 0) pcMax = 60;
    } else {
      notify('⚠️ 微软积分', 'Cookie 失效', '请访问 rewards.bing.com 重新登录');
      pWrite('bingCookie', '');
    }
  }

  log('🔍', '当前 → PC: ' + pcPro + '/' + pcMax + ' | 移动: ' + mPro + '/' + mMax);

  if (pcPro >= pcMax && (mMax === 0 || mPro >= mMax)) {
    pWrite('searchDate', TODAY);
    notify('🟣 微软积分', '搜索完成', 'PC ' + pcPro + '/' + pcMax + ' | 移动 ' + mPro + '/' + mMax + ' ✨');
    return true;
  }

  // 移动端：Bearer Token 方式（优先，稳定）
  if (ACCESS_TOKEN && mMax > 0 && mPro < mMax) {
    await doMobileSearch(mMax - mPro);
  } else if (mMax > 0 && mPro < mMax) {
    log('🟡', '移动端搜索需 Bearer Token，请确认授权码已配置');
  }

  // PC端：Cookie 方式
  if (cookie && pcPro < pcMax) {
    await doPCSearch(cookie, pcMax - pcPro);
  }

  // 重查进度
  let newPcPro = pcPro, newMPro = mPro;
  if (cookie) {
    try {
      const d2 = await getRewardsInfo(cookie);
      if (d2) {
        const c2 = (d2.userStatus && d2.userStatus.counters) || {};
        newPcPro = (c2.pcSearch     && c2.pcSearch[0]     && Number(c2.pcSearch[0].pointProgress))    || pcPro;
        newMPro  = (c2.mobileSearch && c2.mobileSearch[0] && Number(c2.mobileSearch[0].pointProgress)) || mPro;
      }
    } catch (e) {}
  }
  log('🔍', '更新后 → PC: ' + newPcPro + '/' + pcMax + ' | 移动: ' + newMPro + '/' + mMax);

  if (newPcPro >= pcMax && (mMax === 0 || newMPro >= mMax)) {
    pWrite('searchDate', TODAY);
    notify('🟣 微软积分', '搜索完成', 'PC ' + newPcPro + '/' + pcMax + ' | 移动 ' + newMPro + '/' + mMax + ' ✨');
    return true;
  }

  log('🔵', '搜索未满，下次 cron 继续');
  return false;
}

// ==================== 主函数 ====================

async function main() {
  log('🚀', '启动，日期 ' + TODAY);

  const bingCookie = String(pRead('bingCookie', ''));
  const sw = {
    sign:   pRead('taskSign',   true),
    read:   pRead('taskRead',   true),
    promos: pRead('taskPromos', true),
    search: pRead('taskSearch', true),
  };

  // Token 任务（签入 + 阅读 + 移动搜索）
  if (sw.sign || sw.read || sw.search) {
    const ok = await getToken();
    if (!ok) log('🟡', 'Token 获取失败，相关任务跳过');
    if (ok && sw.sign) await taskSign();
    if (ok && sw.read) await taskRead();
  }

  // Cookie 任务（活动 + PC搜索）
  if (sw.promos) await taskPromos(bingCookie);
  if (sw.search) await taskSearch(bingCookie);  // 内部会用 ACCESS_TOKEN 做移动搜索

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
            const avail    = d.userStatus.availablePoints || 0;
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
