/**
 * 微软积分 - 授权码自动捕获
 *
 * 触发时机：用户在浏览器访问 OAuth 授权链接并登录后，
 * 微软会跳转到 login.live.com/oauth20_desktop.srf?code=M.xxx
 * Loon 拦截该请求，自动提取并保存 code。
 *
 * 对应 Plugin 配置：
 *   [Script]
 *   http-request https://login.live.com/oauth20_desktop.srf script-path=capture_auth.js, tag=MS积分-授权码捕获
 *   [MITM]
 *   hostname = login.live.com
 */

'use strict';

(function () {
  try {
    const url = $request.url;

    // 提取 code 参数（格式: M.C540_BAY.2.U.xxxxxxxx-xxxx-...）
    const match = url.match(/[?&]code=(M\.[^&]+)/);
    if (!match) {
      // 没有 code 参数，可能是普通跳转，放行
      $done({});
      return;
    }

    const code = decodeURIComponent(match[1]);
    const savedCode = $persistentStore.read('MSR_authCode') || '';

    // 避免重复保存相同的 code（code 只能用一次，用完后主脚本会清除）
    if (savedCode === code) {
      $done({});
      return;
    }

    // 保存授权码，同时清除旧的 Refresh Token（新 code 需重新换取）
    $persistentStore.write(code, 'MSR_authCode');
    $persistentStore.write('', 'MSR_refreshToken');

    $notification.post(
      '✅ 微软积分',
      '授权码已自动捕获！',
      '签入和阅读任务将在下次 Cron 执行时自动完成。\n（授权码只能使用一次，Refresh Token 获取后自动续期）'
    );

    console.log('[MS积分-授权码] 捕获成功: ' + code.substring(0, 20) + '...');
  } catch (e) {
    console.log('[MS积分-授权码] 捕获出错: ' + e.message);
  }

  $done({});
})();
