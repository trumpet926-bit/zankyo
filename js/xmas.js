// クリスマスの飾り（11月〜12月25日だけ）。書の「残響」はそのままに、色と小さな飾りだけを変える
// 見た目の切り替えは index.html の先頭で html に theme-xmas を付けている。ここでは雪を降らせる

(function () {
  if (!document.documentElement.classList.contains('theme-xmas')) return;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0b2418');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 動きを減らす設定の人には降らせない

  const box = document.createElement('div');
  box.className = 'xmas-snow';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const flake = document.createElement('i');
    const size = 2 + Math.random() * 4;
    flake.style.setProperty('--x', `${Math.random() * 100}%`);
    flake.style.setProperty('--s', `${size}px`);
    flake.style.setProperty('--o', (0.35 + Math.random() * 0.45).toFixed(2));
    flake.style.setProperty('--d', `${10 + Math.random() * 12}s`);
    flake.style.setProperty('--delay', `${-Math.random() * 20}s`);
    flake.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 40}px`);
    box.appendChild(flake);
  }
  document.body.prepend(box);
})();
