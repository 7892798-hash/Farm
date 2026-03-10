/*
Loon 脚本：QQ农场小程序 自动提取 CK (session/token)
功能：
  1. 拦截 ws 握手响应，提取真正的 token/session
  2. 弹出通知提醒
  3. 原始响应正常返回
*/
/*
Loon 脚本：QQ农场 - 捕获 code & openID (http-request)
*/

const url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws")) {

    const params = {};
    const queryString = url.split("?")[1] || "";
    queryString.split("&").forEach(pair => {
        const [key, value] = pair.split("=");
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    });
    const code   = params["code"]   || "";
    console.log("[QQ农场] code   = " + code);
    if (code) {
        $notification.post(
            "🌾 QQ农场参数已捕获",
            `code: ${code}`
        );
    }
}

// http-request 脚本：直接放行，不修改请求
$done({});

