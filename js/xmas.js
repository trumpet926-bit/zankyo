// クリスマスの飾り（11月〜12月25日だけ）。書の「残響」はそのままに、色と小さな飾りだけを変える
// 見た目の切り替えは index.html の先頭で html に theme-xmas を付けている。ここでは雪を降らせる

(function () {
  if (!document.documentElement.classList.contains('theme-xmas')) return;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0b2418');

  // 下のメニューの後ろから顔を出すサンタさん（押すと跳ねて、ひとこと）
  const santa = document.createElement('button');
  santa.className = 'xmas-santa';
  santa.setAttribute('aria-label', 'サンタさん');
  santa.innerHTML = `
    <span class="xmas-bubble">メリークリスマス！</span>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="37" r="15" fill="#fcd9c0"/>
      <path d="M17 29C20 14 36 6 50 14l-4 6C38 15 28 19 47 29Z" fill="#d4282f"/>
      <rect x="14" y="25.5" width="36" height="8" rx="4" fill="#fff"/>
      <circle cx="51" cy="15" r="4.5" fill="#fff"/>
      <path d="M17 39c-1 12 7 20 15 20s16-8 15-20c-3 4-7 5-9 3-3 3-9 3-12 0-2 2-6 1-9-3Z" fill="#fff"/>
      <path d="M24.5 36q2.5-3 5 0M34.5 36q2.5-3 5 0" fill="none" stroke="#3b2a20" stroke-width="2" stroke-linecap="round"/>
      <circle cx="22.8" cy="40" r="2.6" fill="#f7a8b0" opacity="0.8"/>
      <circle cx="41.2" cy="40" r="2.6" fill="#f7a8b0" opacity="0.8"/>
      <ellipse cx="28" cy="44" rx="5" ry="2.8" fill="#fff"/>
      <ellipse cx="36" cy="44" rx="5" ry="2.8" fill="#fff"/>
      <circle cx="32" cy="41" r="2.6" fill="#f08f8f"/>
      <ellipse cx="14" cy="55" rx="5" ry="4" fill="#d4282f"/>
      <ellipse cx="50" cy="55" rx="5" ry="4" fill="#d4282f"/>
    </svg>`;
  santa.addEventListener('click', () => {
    santa.classList.remove('hop');
    void santa.offsetWidth; // 何度押しても、はじめから跳ねる
    santa.classList.add('hop');
  });
  document.body.appendChild(santa);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 動きを減らす設定の人には雪を降らせない

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
