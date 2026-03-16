/*************************
 * Loon 微软积分签到（稳定版）
 *************************/

// 获取请求 URL
let url = $request.url || "";

// 检查 URL 是否符合 微软积分相关请求的特征
if (url.includes("rewards.bing.com") && url.includes("code=")) {

    // 正则匹配获取 code 参数
    const codeMatch = url.match(/[?&]code=([^&]+)/);

    // 如果成功匹配到 code
    if (codeMatch && codeMatch[1]) {

        // 获取 code 值
        const code = codeMatch[1];

        // 保存 code 到 Loon 的持久化存储中
        $persistentStore.write(code, "ms_rewards_code");

        // 弹出通知，提示用户 code 已捕获
        $notification.post(
            "微软积分签到 code 已捕获，可以去兑换积分啦~🎉",
            "",
            "code = " + code
        );

        // 在控制台输出捕获到的 code
        console.log("[微软积分签到] code: " + code);
    } else {
        // 如果没有找到 code，则输出提示
        console.log("[微软积分签到] 未捕获到有效的 code");
    }
}

// 结束脚本的执行
$done({});
