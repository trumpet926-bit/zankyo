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

  // ---------- アイコンの自動更新 ----------
  // アイコンの絵を変えたら、ここと manifest.webmanifest・index.html の ?v= を同じ値に上げる
  // Android：Chrome がアプリの情報（manifest）を見直したときに、ホーム画面のアイコンを自動で替える（数日以内）
  // iPhone：ホーム画面のアイコンは追加したときのまま替わらないので、入れ直しの案内を一度だけ出す
  const ICON_VERSION = '20261123';
  const ICON_KEY = 'practice-app-icon-version';
  if (isStandalone) {
    let seen = null;
    try { seen = localStorage.getItem(ICON_KEY); } catch (e) { seen = ICON_VERSION; }
    const markSeen = () => { try { localStorage.setItem(ICON_KEY, ICON_VERSION); } catch (e) { /* 次回また出るだけ */ } };
    if (seen !== ICON_VERSION) {
      // 新しく入れたばかりの端末は、もう新しいアイコンになっている
      if (!isIOS || (typeof firstRun !== 'undefined' && firstRun)) {
        markSeen();
      } else {
        const banner = document.getElementById('installBanner');
        document.getElementById('installTitle').textContent = 'アプリのアイコンが新しくなりました';
        document.getElementById('installBody').innerHTML =
          'iPhone のホーム画面のアイコンは、自動では替わりません。新しいアイコンにするには、入れ直してください。' +
          '<ol><li>ホーム画面のこのアプリを長押しして <b>削除</b></li>' +
          '<li>Safari で <b>trumpet926-bit.github.io/zankyo</b> を開く</li>' +
          '<li><b>共有ボタン</b>（□に↑）→ <b>「ホーム画面に追加」</b></li></ol>' +
          '※ 残したい録音は、先に「録音」の画面の「共有・保存」で保存してください。';
        const button = document.getElementById('installButton');
        button.textContent = 'このままでよい';
        button.hidden = false;
        button.addEventListener('click', () => { banner.hidden = true; markSeen(); });
        document.getElementById('installClose').addEventListener('click', () => { banner.hidden = true; markSeen(); });
        banner.hidden = false;
      }
    }
    return;
  }

  if (!(isIOS || isAndroid)) return; // PC

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
    // Chrome・Edge・Firefox では共有ボタンがアドレスバーの近くにある
    const isOtherBrowser = /CriOS|EdgiOS|FxiOS/.test(ua);
    const where = isOtherBrowser ? 'アドレスバーの右にある' : '画面下の';
    show('ホーム画面に追加すると、アプリとして使えます',
      `<ol><li>${where} <b>共有ボタン</b>（□に↑のマーク）を押す</li>` +
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
