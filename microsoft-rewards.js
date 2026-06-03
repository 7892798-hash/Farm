/*
 * Loon 微软积分脚本参数化加载器
 * 作用：从 Loon 本地存储读取手动填写的参数，注入油猴环境并动态执行最新原脚本
 */

const $ = new Env("微软积分商城签到");

// =================【核心：参数注入定义】=================
// 脚本会从 Loon 的持久化存储中读取名为 "MS_Rewards_Data" 的键值
// 你可以将你获取到的登录码、Cookie 或 JSON 字符串填入该存储中
const userConfigData = $prefs.valueForKey("MS_Rewards_Data") || "";

// 1. 模拟油猴的存储 API
const GM_getValue = (key, defaultValue) => {
    // 如果原脚本尝试读取全局配置或登录凭证，我们可以在这里进行干预或拦截
    if (key === "Config.LoginData" || key === "ms_login_cookie") { 
        // 这里的 key 取决于原脚本内部存储登录信息的键名，如果原脚本是用 JSON 存储：
        return userConfigData ? JSON.parse(userConfigData) : defaultValue;
    }
    
    // 默认读取 Loon 本地存储
    const val = $prefs.valueForKey(key);
    return val !== undefined ? (isJSON(val) ? JSON.parse(val) : val) : defaultValue;
};

const GM_setValue = (key, value) => {
    const valStr = typeof value === 'object' ? JSON.stringify(value) : value;
    return $prefs.setValueForKey(valStr, key);
};

// 2. 模拟油猴的网络请求 API
const GM_xmlhttpRequest = (details) => {
    const options = {
        url: details.url,
        method: details.method || "GET",
        headers: details.headers || {},
        body: details.data
    };
    
    // 如果你手动获取的是全局 Cookie，也可以在这里强制为所有请求注入 Cookie 报头
    // if (userConfigData && !options.headers["Cookie"]) {
    //     options.headers["Cookie"] = userConfigData;
    // }

    $.ajax(options).then(response => {
        if (details.onload) {
            details.onload({
                status: response.status,
                responseHeaders: response.headers,
                responseText: response.body
            });
        }
    }).catch(err => {
        if (details.onerror) details.onerror(err);
    });
};

// 辅助函数：判断是否为JSON
function isJSON(str) {
    try { JSON.parse(str); return true; } catch (e) { return false; }
}

// 3. 动态拉取原作者最新脚本
const targetUrl = "https://scriptcat.org/scripts/code/5559/%E5%BE%AE%E8%BD%AF%E7%A7%AF%E5%88%86%E5%95%86%E5%9F%8E%E7%AD%BE%E5%88%B0%EF%BC%88%E6%94%B9%E8%BF%9B%E7%89%88%EF%BC%89.user.js";

async function loadAndRun() {
    if (!userConfigData) {
        $.log("❌ 异常：未在 Loon 中检测到手动配置的登录参数【MS_Rewards_Data】，请先前往持久化存储填写！");
        $.done();
        return;
    }

    $.log("🔄 正在从 ScriptCat 获取原作者最新脚本...");
    try {
        const res = await $.ajax({ url: targetUrl, method: "GET" });
        if (res && res.body) {
            $.log("✅ 脚本获取成功，正在注入参数环境并运行...");
            
            // 执行原脚本，由于上面重写了 GM_getValue，原脚本运行时会直接拿到你手动输入的参数
            eval(res.body);
            
        } else {
            $.log("❌ 无法获取脚本内容，请检查网络连接。");
        }
    } catch (e) {
        $.log(`❌ 运行期间发生异常: ${e.message}`);
    } finally {
        $.done();
    }
}

loadAndRun();

// ======= 标准 Loon 兼容环境库 (Env.js) =======
function Env(name) {
    this.name = name;
    this.log = (msg) => console.log(`[${this.name}] ${msg}`);
    this.valueForKey = (key) => $persistentStore.read(key);
    this.setValueForKey = (val, key) => $persistentStore.write(val, key);
    this.ajax = (opts) => {
        return new Promise((resolve, reject) => {
            const method = opts.method.toLowerCase();
            $httpClient[method](opts, (err, resp, body) => {
                if (err) reject(err);
                else resolve({ status: resp.status, headers: resp.headers, body: body });
            });
        });
    };
    this.done = (val = {}) => $done(val);
}
