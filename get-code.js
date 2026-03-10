/*************************
 * Loon QQ农场抓code（稳定版）
 *************************/

let url = $request.url || "";

if (url.includes("gate-obt.nqf.qq.com/prod/ws") && url.includes("code=")) {

    const codeMatch = url.match(/[?&]code=([^&]+)/);

    if (codeMatch && codeMatch[1]) {

        const code = codeMatch[1];

        $persistentStore.write(code, "qq_farm_code");

        $notification.post(
            "QQ农场 code 已捕获，可以拿去挂了哥哥~😍",
            "",
            "code = " + code
        );

        console.log("[QQ农场] code: " + code);
    }
}

$done({});
