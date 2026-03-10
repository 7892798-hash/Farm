/*
Loon 脚本：QQ农场小程序 自动提取 code
功能：
  1. 自动捕获 ws 请求中的 code。
  2. 弹出通知提醒。
  3. 确保原始响应正常返回，不会提示网络断开。
*/
const body = $response.body || ""; // 获取原始响应内容
const url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws") && url.includes("code=")) {
    // 从 URL 里捕获 code 参数
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1];

        // 发送本地通知，提示用户捕获成功
        const notifyTitle = "QQ农场 code 已捕获";
        const notifyBody = `code = ${code}\n\n牛逼，被你抓到了！ 🤩`;

        $notification.post(notifyTitle, "", notifyBody);

        console.log(`[QQ农场] 捕获到 code: ${code}`);
    } else {
        console.log("[QQ农场] 未在 URL 中找到 code 参数");
    }
} else {
    console.log("[QQ农场] URL 不匹配目标");
}

// 必须返回原响应内容，确保网络连接正常
$done({ body：body });