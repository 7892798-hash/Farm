/*************************
 * Loon 脚本：QQ农场小程序 自动提取 code
 * 使用方式：
 *   1. 进入 QQ → 经典农场小程序
 *   2. 脚本自动抓 ws 连接里的 code
 *   3. 本地通知 + 存到持久化
 *************************/

let body = $response.body || "";
let url = $request.url || "";

if (url.indexOf("gate-obt.nqf.qq.com/prod/ws") !== -1 && url.indexOf("code=") !== -1) {

    // 从 URL 提取 code
    const codeMatch = url.match(/[?&]code=([^&]+)/);

    if (codeMatch && codeMatch[1]) {

        const code = codeMatch[1];

        // 存储
        $persistentStore.write(code, "qq_farm_code");

        // 通知
        $notification.post(
            "QQ农场 code 已捕获",
            "",
            `code = ${code}\n\n已保存，可以拿去挂了哥哥~`
        );

        console.log("[QQ农场] 捕获到 code: " + code);

    } else {
        console.log("[QQ农场] 未在 URL 中找到 code 参数");
    }
}

// 返回原响应
$done({body});
