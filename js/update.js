// 新しい版の確認と自動更新
// ホーム画面のアプリは閉じずに眠っているだけなので、開いたとき・戻ってきたときに新しい版を確かめる

(function () {
  const LAST_VERSION_KEY = 'practice-app-version';
  let pending = false; // 新しい版が見つかり、更新を待っている

  // 演奏・録音の最中や、文字を入力している最中は更新しない
  function busy() {
    const active = document.activeElement;
    return metronome.isRunning || recorder.isRecording || scalePlayer.isRunning || tuner.isRunning || drone.playing ||
      player.playing || syncHooks.active() ||
      (active && active.tagName === 'INPUT' && active.type === 'text');
  }

  async function publishedVersion() {
    const res = await fetch('js/version.js', { cache: 'no-store' });
    const match = (await res.text()).match(/APP_VERSION = '([^']+)'/);
    return match ? match[1] : null;
  }

  async function applyUpdate() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      // 端末に保存しておいた古いファイルを捨てる（録音や設定は別の場所にあるので消えない）
      for (const key of await caches.keys()) await caches.delete(key);
    } catch (e) {
      // できなくても読み込み直しは行う
    }
    location.reload();
  }

  function tryApply() {
    if (!pending) return;
    if (busy()) {
      $('updateBanner').hidden = false;
      return;
    }
    applyUpdate();
  }

  async function check() {
    // 公開しているアプリ（https）と、PC での動作確認用（localhost）のときだけ確かめる
    if (pending || !navigator.onLine || (location.protocol !== 'https:' && location.hostname !== 'localhost')) return;
    try {
      const version = await publishedVersion();
      if (version && version !== APP_VERSION) {
        pending = true;
        tryApply();
      }
    } catch (e) {
      // 電波がないときなどは、次の機会に確かめる
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setTimeout(check, 3000);
  setInterval(check, 30 * 60 * 1000);
  setInterval(tryApply, 5000); // 演奏などが終わったら更新する

  // 更新したあとに一度だけ知らせる
  try {
    const last = localStorage.getItem(LAST_VERSION_KEY);
    if (last && last !== APP_VERSION) {
      $('updatedToast').hidden = false;
      setTimeout(() => { $('updatedToast').hidden = true; }, 4000);
    }
    localStorage.setItem(LAST_VERSION_KEY, APP_VERSION);
  } catch (e) {
    // 保存できない環境では知らせない
  }
})();
