/*
Loon 脚本：QQ农场小程序 自动提取 CK (session/token)
功能：
  1. 拦截 ws 握手响应，提取真正的 token/session
  2. 弹出通知提醒
  3. 原始响应正常返回
*/
const url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws")) {
    
    // 解析 URL 参数
    const params = {};
    const queryString = url.split("?")[1] || "";
    queryString.split("&").forEach(pair => {
        const [key, value] = pair.split("=");
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    });

    const code   = params["code"]   || "";
    const openID = params["openID"] || "";

    console.log("[QQ农场] code   = " + code);
    console.log("[QQ农场] openID = " + openID);

    if (code) {
        $notification.post(
            "🌾 QQ农场参数已捕获",
            `openID: ${openID || "（空）"}`,
            `code: ${code}`
        );
    } else {
        console.log("[QQ农场] 未找到 code");
    }
}

$done({ body: $response.body || "" });
