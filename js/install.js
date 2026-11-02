// ホーム画面への追加の案内と、電波がなくても動くようにする仕組みの登録

(function () {
  const ua = navigator.userAgent;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isInAppBrowser = /\bLine\//i.test(ua) || /FBAN|FBAV|Instagram/.test(ua);
  const DISMISS_KEY = 'practice-app-install-dismissed';

  // 電波がなくても動くように、ファイルを端末に保存しておく
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  if (isStandalone || !(isIOS || isAndroid)) return; // ホーム画面から開いている、またはPC

  const banner = document.getElementById('installBanner');
  const title = document.getElementById('installTitle');
  const body = document.getElementById('installBody');
  const button = document.getElementById('installButton');

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function show(titleText, bodyHtml) {
    title.textContent = titleText;
    body.innerHTML = bodyHtml;
    banner.hidden = false;
  }

  document.getElementById('installClose').addEventListener('click', () => {
    banner.hidden = true;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* 保存できなくても閉じる */ }
  });

  // LINE などのアプリの中で開いたとき（閉じても次回また出す）
  if (isInAppBrowser) {
    show('ブラウザで開いてください',
      isIOS
        ? '今はLINEの中で開いています。このままではマイクやホーム画面への追加が使えません。<br>右下の <b>︙</b> などのメニューから <b>「Safariで開く」</b>（または「ブラウザで開く」）を選んでください。'
        : '今はLINEの中で開いています。このままではマイクやホーム画面への追加が使えません。<br>右上の <b>︙</b> メニューから <b>「ブラウザで開く」</b>（またはChromeで開く）を選んでください。');
    return;
  }

  if (dismissed()) return;

  if (isIOS) {
    show('ホーム画面に追加すると、アプリとして使えます',
      '<ol><li>画面下の <b>共有ボタン</b>（□に↑のマーク）を押す</li>' +
      '<li><b>「ホーム画面に追加」</b>を選ぶ（見当たらないときは下にスクロール）</li>' +
      '<li>右上の <b>「追加」</b>を押す</li></ol>');
    return;
  }

  // Android：Chrome が追加の準備をできたらボタンを出す
  show('ホーム画面に追加すると、アプリとして使えます',
    '右上の <b>︙</b> メニューから <b>「アプリをインストール」</b>（または「ホーム画面に追加」）を選んでください。');
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    body.textContent = '下のボタンを押すと、ホーム画面に追加されます。';
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    banner.hidden = true;
  });
  window.addEventListener('appinstalled', () => { banner.hidden = true; });
})();
