/*
Loon 脚本：QQ农场小程序 自动提取 code
使用方式：
  1. 进入 QQ → 经典农场小程序
  2. 脚本会自动抓到 ws 连接里的 code
  3. 弹出本地通知后停止脚本运行
*/

const url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws") && url.includes("code=")) {
    // 从 URL 里获取 code
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1];

        // 弹出本地通知（用于提醒用户）
        const notifyTitle = "QQ农场 code 已捕获";
        const notifyBody = `code = ${code}\n\n已捕获 code，脚本执行完毕！🤩`;

        $notification.post(notifyTitle, "", notifyBody);

        console.log(`[QQ农场] 捕获到 code: ${code}`);
    } else {
        console.log("[QQ农场] 未在 URL 中找到 code 参数");
    }
} else {
    console.log("[QQ农场] 未匹配到目标 URL");
}
// 捕获完成后直接结束脚本运行
$done();