// アプリを人に紹介する画面（上の「紹介」ボタン）。QRコードを見せるか、リンクを送る

(function () {
  const APP_URL = 'https://trumpet926-bit.github.io/zankyo/';
  const SHARE_TEXT = '管楽器の練習アプリ「残響 PracticeTool」。無料・登録不要で、スマホですぐ使えます。';

  function openShare() {
    $('shareCopy').textContent = 'コピー';
    $('shareView').hidden = false;
    $('shareView').scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function closeShare() {
    $('shareView').hidden = true;
    document.body.style.overflow = '';
  }

  $('openShare').addEventListener('click', openShare);
  $('closeShare').addEventListener('click', closeShare);

  // LINE などで開いたときは、外のブラウザ（Safari・Chrome）で開くようにする
  $('shareSend').addEventListener('click', () => {
    const url = `${APP_URL}?openExternalBrowser=1`;
    if (navigator.share) {
      navigator.share({ title: '残響 PracticeTool', text: SHARE_TEXT, url }).catch(() => {});
    } else {
      $('shareCopy').click();
    }
  });

  $('shareCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT}\n${APP_URL}?openExternalBrowser=1`);
      $('shareCopy').textContent = 'コピーしました';
    } catch (e) {
      $('shareCopy').textContent = 'コピーできませんでした';
    }
  });
})();
