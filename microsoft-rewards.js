/**
 * 微软积分商城签到 - Loon 版
 * 原作者: geoisam@qq.com (Tampermonkey版)
 * Loon 适配: 支持签入、阅读、活动、搜索
 *
 * ==================== 配置说明 ====================
 * 以下配置通过 BoxJS 或 Loon 脚本参数设置:
 *
 *  MSR_authCode    - 授权码链接（用于签入/阅读）
 *                    获取方式见: https://github.com/geoisam/FuckScripts
 *  MSR_bingCookie  - Bing 登录 Cookie（用于活动/搜索）
 *                    浏览器登录 bing.com → F12 → Network → 任意请求 → 复制 Cookie 字段值
 *  MSR_taskSign    - 启用签入 (true/false), 默认 true
 *  MSR_taskRead    - 启用阅读 (true/false), 默认 true
 *  MSR_taskPromos  - 启用活动 (true/false), 默认 true
 *  MSR_taskSearch  - 启用搜索 (true/false), 默认 true
 * ================================================
 */

'use strict';

// ==================== 工具函数 ====================

function read(key, def) {
  try {
    const raw = $persistentStore.read('MSR_' + key);
    if (raw === null || raw === undefined || raw === '') return def;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  } catch (e) { return def; }
}

function write(key, val) {
  const s = (val === null || val === undefined) ? ''
    : (typeof val === 'string' ? val : JSON.stringify(val));
  $persistentStore.write(s, 'MSR_' + key);
}

function log(tag, msg) {
  console.log('[MS积分' + tag + '] ' + msg);
}

function notify(tag, msg, push) {
  log(tag, msg);
  if (push) $notification.post('🎯 微软积分', tag, msg);
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

function todayHyphen() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function todaySlash() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0') + '/' +
    d.getFullYear();
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

// 手动构建 URL 编码参数（避免 URLSearchParams 兼容性问题）
function encodeParams(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

// HTTP 请求 Promise 封装
function http(opt) {
  return new Promise(function (resolve, reject) {
    const req = {
      url: opt.url,
      headers: opt.headers || {},
    };
    if (opt.body || opt.data) req.body = opt.body || opt.data;

    function cb(err, res, data) {
      if (err) { reject(new Error(String(err))); return; }
      const status = res.status || res.statusCode || 0;
      if (status >= 200 && status < 300) {
        resolve({ status: status, data: data || '', headers: res.headers || {} });
        return;
      }
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        const h = res.headers || {};
        resolve({ status: status, data: h.location || h.Location || '', headers: h });
        return;
      }
      reject(new Error('HTTP ' + status + ': ' + opt.url.substring(0, 60)));
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
const TODAY_HYPHEN = todayHyphen();
const TODAY_SLASH = todaySlash();
const BING_HOST = read('bingHost', 'cn.bing.com'); // 中国区用 cn.bing.com，国际用 www.bing.com

// 离线搜索词库
const SEARCH_WORDS = [
  '天气预报', '今日新闻', '体育赛事', '股票行情', '电影推荐',
  '科技资讯', '美食食谱', '旅游攻略', '历史上的今天', '健康常识',
  '最新手机', '编程教程', '英语学习', '减肥方法', '理财知识',
  '汽车资讯', '房价走势', '教育政策', '新能源汽车', '人工智能',
  '足球直播', '篮球比赛', '股市分析', '基金收益', '美食推荐',
  '网络安全', '云计算技术', '大数据分析', '区块链应用', '物联网发展',
];

// ==================== Token 管理 ====================

let ACCESS_TOKEN = '';

async function refreshToken() {
  const savedRefresh = read('refreshToken', '');
  let url;

  if (!savedRefresh) {
    const codeRaw = read('authCode', '');
    if (!codeRaw) {
      notify('🔴', '请先配置授权码链接（MSR_authCode）！', true);
      return false;
    }
    const match = codeRaw.match(/M\.[^&]+/);
    if (!match) {
      notify('🔴', '授权码链接格式错误，请重新获取！', true);
      return false;
    }
    const authCode = match[0];
    log('🟢', '使用授权码获取 Token...');
    url = 'https://login.live.com/oauth20_token.srf' +
      '?client_id=0000000040170455' +
      '&code=' + authCode +
      '&redirect_uri=https://login.live.com/oauth20_desktop.srf' +
      '&grant_type=authorization_code';
  } else {
    log('🟢', '使用 Refresh Token 续期...');
    url = 'https://login.live.com/oauth20_token.srf' +
      '?client_id=0000000040170455' +
      '&refresh_token=' + savedRefresh +
      '&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL' +
      '&grant_type=REFRESH_TOKEN';
  }

  try {
    const res = await http({ url: url });
    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      if (j.refresh_token && j.access_token) {
        write('refreshToken', j.refresh_token);
        ACCESS_TOKEN = j.access_token;
        log('🟢', 'Token 获取/续期成功');
        return true;
      }
    }
    notify('🟡', 'Token 获取失败，请重新填写授权码链接', true);
    write('refreshToken', ''); // 清除失效的 refresh token
  } catch (e) {
    notify('🔴', 'Token 请求出错: ' + e.message, true);
    if (!savedRefresh) {
      // authCode 只能用一次，清掉防止重复使用
    } else {
      write('refreshToken', ''); // refresh token 失效，清除
    }
  }
  return false;
}

// ==================== 任务：签入 ====================

async function taskSign() {
  if (read('signDate', 0) === TODAY) {
    log('✅', '今日已完成签入，跳过');
    return { done: true };
  }

  log('📌', '开始执行签入任务...');
  const region = 'cn';

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
        'x-rewards-country': region,
        'x-rewards-partnerid': 'startapp',
        'x-rewards-flights': 'rwgobig',
      },
      body: JSON.stringify({
        amount: 1,
        attributes: {},
        id: genUUID(),
        type: 103,
        country: region,
        risk_context: {},
        channel: 'SAAndroid',
      }),
    });

    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      const point = (j && j.response && j.response.activity && j.response.activity.p) || 0;
      write('signDate', TODAY);
      write('signPoint', point);
      const msg = point > 0
        ? '签入成功！获得 ' + point + ' 积分 ✨'
        : '今日已签入，无法重复签入';
      notify('🟣', msg, true);
      return { done: true, point: point };
    }
  } catch (e) {
    notify('🔴', '签入任务出错: ' + e.message);
  }
  return { done: false };
}

// ==================== 任务：阅读 ====================

async function getReadProgress() {
  try {
    const res = await http({
      url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'user-agent': UA.m,
        'authorization': 'Bearer ' + ACCESS_TOKEN,
        'x-rewards-appid': 'SAAndroid/31.4.2110003555',
        'x-rewards-ismobile': 'true',
      },
    });

    if (res.data && isJSON(res.data)) {
      const j = JSON.parse(res.data);
      const pro = (j && j.response && j.response.promotions) || [];
      for (let i = 0; i < pro.length; i++) {
        const o = pro[i];
        if (o.attributes && o.attributes.offerid === 'ENUS_readarticle3_30points') {
          return {
            max: Number(o.attributes.max) || 30,
            progress: Number(o.attributes.progress) || 0,
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
  if (read('readDate', 0) === TODAY) {
    log('✅', '今日已完成阅读，跳过');
    return { done: true };
  }

  log('📖', '开始执行阅读任务...');

  try {
    const prog = await getReadProgress();
    const cur = prog.progress;
    const max = prog.max || 30;

    if (cur >= max) {
      write('readDate', TODAY);
      notify('✅', '阅读已完成 ' + cur + '/' + max, false);
      return { done: true };
    }

    const needed = Math.ceil((max - cur) / 3);
    log('📖', '需阅读 ' + needed + ' 篇 (当前进度 ' + cur + '/' + max + ')');

    const region = 'cn';
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
            'x-rewards-country': region,
          },
          body: JSON.stringify({
            amount: 1,
            country: region,
            id: genUUID(),
            type: 101,
            attributes: { offerid: 'ENUS_readarticle3_30points' },
          }),
        });
        log('📖', '已阅读 ' + (i + 1) + '/' + needed + ' 篇');
      } catch (e) {
        log('🟡', '第 ' + (i + 1) + ' 篇阅读请求失败: ' + e.message);
      }
      if (i < needed - 1) await sleep(randRange(3000, 6000));
    }

    write('readDate', TODAY);
    notify('🟣', '阅读任务完成！奖励 ' + max + ' 积分 ✨', true);
    return { done: true, point: max };
  } catch (e) {
    notify('🔴', '阅读任务出错: ' + e.message);
  }
  return { done: false };
}

// ==================== 任务：活动 ====================

async function getRewardsInfo(bingCookie) {
  try {
    const res = await http({
      url: 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=' + Date.now(),
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'referer': 'https://rewards.bing.com/',
        'user-agent': UA.pc,
        'cookie': bingCookie,
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

async function getRewardsToken(bingCookie) {
  try {
    const res = await http({
      url: 'https://rewards.bing.com/',
      headers: {
        'referer': 'https://rewards.bing.com/',
        'user-agent': UA.pc,
        'cookie': bingCookie,
      },
    });
    const cleaned = res.data.replace(/\s/g, '');
    const match = cleaned.match(/RequestVerificationToken[^>]*?value="([^"]+)"/);
    if (match) return match[1];
  } catch (e) {
    log('🔴', 'RequestVerificationToken 获取出错: ' + e.message);
  }
  return null;
}

async function taskPromos(bingCookie) {
  if (read('promosDate', 0) === TODAY) {
    log('✅', '今日已完成活动，跳过');
    return { done: true };
  }

  if (!bingCookie) {
    notify('🟡', '未配置 Bing Cookie，跳过活动任务', false);
    return { done: true };
  }

  log('🎯', '开始执行活动任务...');

  try {
    const dashboard = await getRewardsInfo(bingCookie);
    if (!dashboard) {
      notify('🟡', 'Bing Cookie 可能已过期，请重新获取！', true);
      return { done: false };
    }

    if (dashboard.isSuspended || (dashboard.userStatus && dashboard.userStatus.isSuspended)) {
      notify('🔴', '检测到账号被暂停！已停止所有任务！', true);
      return { done: true };
    }

    const reqToken = await getRewardsToken(bingCookie);
    if (!reqToken) {
      log('🟡', '无法获取请求令牌，跳过活动任务');
      return { done: false };
    }

    const morePromos = Array.isArray(dashboard.morePromotions) ? dashboard.morePromotions : [];
    const dailySet = (dashboard.dailySetPromotions && dashboard.dailySetPromotions[TODAY_SLASH]) || [];
    const allPromos = dailySet.concat(morePromos);

    let promoPoints = 0, promoMax = 0;
    const todo = [];

    for (let i = 0; i < allPromos.length; i++) {
      const item = allPromos[i];
      if (item.priority > -2 && item.exclusiveLockedFeatureStatus !== 'locked') {
        const maxPt = parseInt(item.pointProgressMax) || 0;
        let curPt = parseInt(item.pointProgress) || 0;
        if (item.complete && curPt === 0) curPt = maxPt;
        promoMax += maxPt;
        promoPoints += curPt;
        if (!item.complete) {
          todo.push({ id: item.offerId, hash: item.hash, url: item.destinationUrl });
        }
      }
    }

    if (todo.length === 0) {
      write('promosDate', TODAY);
      notify('🟣', '活动任务已完成！奖励 ' + promoPoints + '/' + promoMax + ' 积分', true);
      return { done: true, point: promoPoints };
    }

    log('🎯', '待完成活动 ' + todo.length + ' 个，总进度 ' + promoPoints + '/' + promoMax);

    for (let i = 0; i < todo.length; i++) {
      const item = todo[i];
      try {
        await http({
          method: 'POST',
          url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
          headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'referer': item.url || 'https://rewards.bing.com/',
            'user-agent': UA.pc,
            'cookie': bingCookie,
          },
          body: encodeParams({
            id: item.id,
            hash: item.hash || '',
            timeZone: 480,
            activityAmount: 1,
            dbs: 0,
            form: '',
            type: '',
            __RequestVerificationToken: reqToken,
          }),
        });
        log('🎯', '活动 ' + (i + 1) + '/' + todo.length + ' 已上报: ' + item.id);
      } catch (e) {
        log('🟡', '活动上报失败: ' + e.message);
      }
      if (i < todo.length - 1) await sleep(randRange(1500, 3000));
    }

    write('promosDate', TODAY);
    notify('🟣', '活动任务完成！共处理 ' + todo.length + ' 个活动', true);
    return { done: true };
  } catch (e) {
    notify('🔴', '活动任务出错: ' + e.message);
  }
  return { done: false };
}

// ==================== 任务：搜索 ====================

function getSearchWord() {
  const word = SEARCH_WORDS[randInt(SEARCH_WORDS.length)];
  return word + ' ' + Math.random().toString(36).slice(2, 5);
}

async function taskSearch(bingCookie) {
  if (read('searchDate', 0) === TODAY) {
    log('✅', '今日已完成搜索，跳过');
    return { done: true };
  }

  if (!bingCookie) {
    notify('🟡', '未配置 Bing Cookie，跳过搜索任务', false);
    return { done: true };
  }

  log('🔍', '开始执行搜索任务...');

  // 获取当前搜索进度
  const dashboard = await getRewardsInfo(bingCookie);
  if (!dashboard) {
    notify('🟡', 'Bing Cookie 可能已过期，请重新获取！', true);
    return { done: false };
  }

  const counters = (dashboard.userStatus && dashboard.userStatus.counters) || {};
  let pcProgress = (counters.pcSearch && counters.pcSearch[0] && counters.pcSearch[0].pointProgress) || 0;
  let pcMax = (counters.pcSearch && counters.pcSearch[0] && counters.pcSearch[0].pointProgressMax) || 60;
  let mProgress = (counters.mobileSearch && counters.mobileSearch[0] && counters.mobileSearch[0].pointProgress) || 0;
  let mMax = (counters.mobileSearch && counters.mobileSearch[0] && counters.mobileSearch[0].pointProgressMax) || 0;
  if (pcMax === 0) pcMax = 60;

  log('🔍', 'PC: ' + pcProgress + '/' + pcMax + '  移动: ' + mProgress + '/' + mMax);

  if (pcProgress >= pcMax && mProgress >= mMax) {
    write('searchDate', TODAY);
    notify('🟣', '搜索任务已完成！PC: ' + pcProgress + '/' + pcMax + ', 移动: ' + mProgress + '/' + mMax, true);
    return { done: true };
  }

  // 本次最多搜索次数（每次 cron 执行搜索若干次）
  const searchLimit = randRange(4, 7);
  let searchCount = 0;

  for (let i = 0; i < searchLimit; i++) {
    const keyword = getSearchWord();

    // 根据剩余进度决定用PC还是移动UA
    let usePC = Math.random() > 0.4;
    if (pcProgress >= pcMax) usePC = false;
    if (mProgress >= mMax) usePC = true;

    const device = usePC ? 'PC' : 'Mobile';
    const ua = usePC ? UA.pc : UA.m;
    const rwho = usePC
      ? ('u=d&ts=' + TODAY_HYPHEN)
      : ('u=m&ts=' + TODAY_HYPHEN);
    const params = 'q=' + encodeURIComponent(keyword) + '&form=QBLH&mkt=zh-CN';
    const searchUrl = 'https://' + BING_HOST + '/search?' + params;

    try {
      const res = await http({
        url: searchUrl,
        headers: {
          'user-agent': ua,
          'cookie': bingCookie + '; _Rwho=' + rwho,
          'referer': 'https://' + BING_HOST + '/?form=QBLH',
        },
      });

      if (res.data) {
        const cleaned = res.data.replace(/\s/g, '');
        const igMatch = cleaned.match(/,IG:"([^"]+)"/);
        const guid = igMatch ? igMatch[1] : genUUID(true);

        const baseHeaders = {
          'user-agent': ua,
          'cookie': bingCookie + '; _Rwho=' + rwho,
          'referer': searchUrl,
        };

        // 上报搜索活动（忽略错误）
        try {
          await http({
            method: 'POST',
            url: 'https://' + BING_HOST + '/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=' + guid + '&ajaxreq=1',
            headers: baseHeaders,
            body: 'wb=1%3bi%3d1%3bv%3d1',
          });
        } catch (e) { /* ignore */ }

        try {
          await http({
            method: 'POST',
            url: 'https://' + BING_HOST + '/rewardsapp/reportActivity?IG=' + guid + '&IID=SERP.5047&' + params + '&ajaxreq=1',
            headers: baseHeaders,
            body: 'url=' + encodeURIComponent(searchUrl) + '&V=web',
          });
        } catch (e) { /* ignore */ }
      }

      searchCount++;
      log('🔍', '第 ' + searchCount + '/' + searchLimit + ' 次 (' + device + '): ' + keyword);
    } catch (e) {
      log('🟡', '搜索请求出错: ' + e.message);
    }

    if (i < searchLimit - 1) {
      const waitMs = randRange(20000, 40000);
      log('⏳', '等待 ' + (waitMs / 1000).toFixed(0) + ' 秒后继续...');
      await sleep(waitMs);
    }
  }

  // 再次获取进度确认是否完成
  try {
    const d2 = await getRewardsInfo(bingCookie);
    if (d2) {
      const c2 = (d2.userStatus && d2.userStatus.counters) || {};
      const pc2 = (c2.pcSearch && c2.pcSearch[0] && c2.pcSearch[0].pointProgress) || 0;
      const pcMax2 = (c2.pcSearch && c2.pcSearch[0] && c2.pcSearch[0].pointProgressMax) || pcMax;
      const m2 = (c2.mobileSearch && c2.mobileSearch[0] && c2.mobileSearch[0].pointProgress) || 0;
      const mMax2 = (c2.mobileSearch && c2.mobileSearch[0] && c2.mobileSearch[0].pointProgressMax) || mMax;

      if (pc2 >= pcMax2 && m2 >= mMax2) {
        write('searchDate', TODAY);
        notify('🟣', '搜索任务全部完成！PC: ' + pc2 + '/' + pcMax2 + ', 移动: ' + m2 + '/' + mMax2, true);
        return { done: true };
      }

      log('🔵', '本次搜索 ' + searchCount + ' 次，PC: ' + pc2 + '/' + pcMax2 + ', 移动: ' + m2 + '/' + mMax2 + '（下次 cron 继续）');
    }
  } catch (e) { /* ignore */ }

  return { done: false };
}

// ==================== 主函数 ====================

async function main() {
  log('🚀', '脚本启动，日期: ' + TODAY);

  const bingCookie = read('bingCookie', '');
  const taskSwitch = {
    sign: read('taskSign', true),
    read: read('taskRead', true),
    promos: read('taskPromos', true),
    search: read('taskSearch', true),
  };

  // ---- 签入 & 阅读（需要 OAuth Token）----
  if (taskSwitch.sign || taskSwitch.read) {
    const tokenOk = await refreshToken();
    if (tokenOk) {
      if (taskSwitch.sign) await taskSign();
      if (taskSwitch.read) await taskRead();
    } else {
      log('🔴', 'Token 获取失败，跳过签入和阅读任务');
    }
  }

  // ---- 活动 & 搜索（需要 Bing Cookie）----
  if (taskSwitch.promos) await taskPromos(bingCookie);
  if (taskSwitch.search) await taskSearch(bingCookie);

  // ---- 检查全部完成 ----
  const signOk = !taskSwitch.sign || read('signDate', 0) === TODAY;
  const readOk = !taskSwitch.read || read('readDate', 0) === TODAY;
  const promosOk = !taskSwitch.promos || read('promosDate', 0) === TODAY;
  const searchOk = !taskSwitch.search || read('searchDate', 0) === TODAY;

  if (signOk && readOk && promosOk && searchOk) {
    const lastAll = read('allDoneDate', 0);
    if (lastAll !== TODAY) {
      write('allDoneDate', TODAY);

      let summary = '🎉 今日所有任务已全部完成！\n';

      // 获取总积分信息
      if (bingCookie) {
        try {
          const d = await getRewardsInfo(bingCookie);
          if (d && d.userStatus) {
            const avail = d.userStatus.availablePoints || 0;
            const todayPts = (d.userStatus.counters && d.userStatus.counters.dailyPoint
              && d.userStatus.counters.dailyPoint[0]
              && d.userStatus.counters.dailyPoint[0].pointProgress) || 0;
            summary += '✨ 今日获取: ' + todayPts + ' 积分\n';
            summary += '💰 当前总积分: ' + avail + ' 积分';
          }
        } catch (e) { /* ignore */ }
      }

      notify('🎉', summary, true);
    } else {
      log('💤', '今日所有任务已完成，保持休眠');
    }
  }

  log('✅', '本次执行结束');
}

// ==================== 入口 ====================

main().catch(function (e) {
  notify('🔴', '脚本异常退出: ' + e.message, true);
}).finally(function () {
  $done();
});
