/*
Loon 脚本：QQ农场小程序 自动提取 CK (session/token)
功能：
  1. 拦截 ws 握手响应，提取真正的 token/session
  2. 弹出通知提醒
  3. 原始响应正常返回
*/
/*
Loon 脚本：QQ农场 - 捕获 code (http-response)
对应 QX 版本移植
*/

const url = $request.url || "";
const body = $response.body || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws") && url.includes("code=")) {
    
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1];

        // Loon 用 $persistentStore 对应 QX 的 $prefs
        $persistentStore.write(code, "qq_farm_code");

        $notification.post(
            "QQ农场 code 已捕获",
            "",
            `code = ${code}\n\n已保存，可以拿去挂了！🤩`
        );

        console.log("[QQ农场] 捕获到 code: " + code);
    }
}

// http-response 必须返回 body，对应 QX 的 $done({ body })
$done({ body: body });
