/*
Loon 脚本：QQ农场 - 捕获 code 和 openID
*/

const url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws")) {
    console.log("[QQ农场] 命中 URL: " + url);

    // 解析所有 URL 参数
    const params = {};
    const queryString = url.split("?")[1] || "";
    queryString.split("&").forEach(pair => {
        const [key, value] = pair.split("=");
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    });

    const code   = params["code"]   || "";
    const openID = params["openID"] || "";
    const ver    = params["ver"]    || "";

    console.log("[QQ农场] code   = " + code);
    console.log("[QQ农场] openID = " + openID);
    console.log("[QQ农场] ver    = " + ver);

    if (!openID) {
        $notification.post(
            "QQ农场 ⚠️ openID 为空",
            "这是加载失败的原因",
            "请确认小程序登录流程是否完整，openID 未传入"
        );
    } else if (code && openID) {
        $notification.post(
            "QQ农场 ✅ 参数捕获成功",
            "",
            `code=${code}\nopenID=${openID}`
        );
    }
}

$done({ body: $response.body || "" });
