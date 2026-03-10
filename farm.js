/*
Loon 脚本：QQ农场小程序 自动提取 CK (session/token)
功能：
  1. 拦截 ws 握手响应，提取真正的 token/session
  2. 弹出通知提醒
  3. 原始响应正常返回
*/

const url = $request.url || "";
const body = $response.body || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws")) {
    console.log("[QQ农场] 命中目标 URL");
    console.log("[QQ农场] 响应体：" + body);

    // 尝试解析响应体（一般是 JSON）
    try {
        const json = JSON.parse(body);

        // 根据实际响应结构调整字段名
        // 常见字段：token、access_token、session、uin、skey 等
        const token = json.token 
                    || json.access_token 
                    || json.data?.token 
                    || json.data?.access_token 
                    || null;

        const uin = json.uin 
                 || json.data?.uin 
                 || null;

        const skey = json.skey 
                  || json.data?.skey 
                  || null;

        if (token) {
            $notification.post(
                "QQ农场 Token 已捕获 🎉",
                "",
                `Token: ${token}`
            );
            console.log("[QQ农场] Token: " + token);
        }

        if (uin && skey) {
            const ck = `uin=${uin}; skey=${skey}`;
            $notification.post(
                "QQ农场 CK 已捕获 🎉",
                "",
                ck
            );
            console.log("[QQ农场] CK: " + ck);
        }

        // 如果上面都没匹配到，把完整响应打印出来方便调试
        if (!token && !(uin && skey)) {
            console.log("[QQ农场] 未找到已知字段，完整响应：" + body);
            $notification.post(
                "QQ农场 响应已捕获（需调试）",
                "请查看 Loon 日志",
                body.substring(0, 100) // 通知只显示前100字符
            );
        }

    } catch (e) {
        // 响应体不是 JSON，可能是纯文本或其他格式
        console.log("[QQ农场] 响应体非 JSON，原始内容：" + body);
        $notification.post("QQ农场 原始响应", "", body.substring(0, 150));
    }

} else {
    console.log("[QQ农场] URL 不匹配");
}

// 必须返回原响应，不能修改，否则小程序会断开
$done({ body });
