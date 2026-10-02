(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !['https:', 'http:'].includes(location.protocol)) return;
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const upgrading = Boolean(navigator.serviceWorker.controller);
  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!upgrading || refreshed) return;
    refreshed = true;
    const refresh = () => window.BoardRoom?.busy ? setTimeout(refresh, 200) : location.reload();
    refresh();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('离线缓存未启用：', error));
  });
})();
