// クリスマスの飾り（11月〜12月25日だけ）。書の「残響」はそのままに、色と小さな飾りだけを変える
// 見た目の切り替えは index.html の先頭で html に theme-xmas を付けている。ここでは雪を降らせる

(function () {
  if (!document.documentElement.classList.contains('theme-xmas')) return;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0b2418');

  // 押した仲間から、星・プレゼント・雪の結晶が飛び出す
  const BURST = ['⭐', '🎁', '❄️', '✨', '🎄', '⭐', '🎁', '❄️'];
  function burst(el) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    BURST.forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'xmas-pop';
      s.textContent = ch;
      const angle = (-150 + (i / (BURST.length - 1)) * 120) * (Math.PI / 180);
      const dist = 70 + Math.random() * 50;
      s.style.left = `${rect.left + rect.width / 2}px`;
      s.style.top = `${rect.top + 10}px`;
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      s.style.setProperty('--r', `${(Math.random() * 2 - 1) * 90}deg`);
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    });
  }

  // 上の帯の下に、ちかちか光る電球を下げる
  const lights = document.createElement('div');
  lights.className = 'xmas-lights';
  lights.setAttribute('aria-hidden', 'true');
  const COLORS = ['#ff4d55', '#ffd54a', '#4ade80', '#60a5fa'];
  for (let i = 0; i < 16; i++) {
    const bulb = document.createElement('i');
    bulb.style.setProperty('--c', COLORS[i % COLORS.length]);
    bulb.style.setProperty('--delay', `${(i % 4) * 0.45}s`);
    bulb.style.left = `${(i + 0.5) * (100 / 16)}%`;
    bulb.style.top = `${4 + Math.sin(((i % 4) / 4) * Math.PI) * 6}px`;
    lights.appendChild(bulb);
  }
  document.querySelector('.app-header').appendChild(lights);

  // 下のメニューの後ろから顔を出す、サンタさん・トナカイ・雪だるま・ツリー（押すと跳ねて、ひとこと）
  const FRIENDS = [
    {
      label: 'サンタさん',
      say: 'メリークリスマス！',
      svg: `
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
        <ellipse cx="50" cy="55" rx="5" ry="4" fill="#d4282f"/>`,
    },
    {
      label: 'トナカイ',
      say: 'シャンシャン♪',
      svg: `
        <path d="M23 24 17 9M19.5 15.5 12 13M20.5 19 14 19.5M41 24l6-15M44.5 15.5 52 13M43.5 19l6.5.5" fill="none" stroke="#8a5a3b" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="17" cy="29" rx="6.5" ry="3.6" transform="rotate(-28 17 29)" fill="#a8714f"/>
        <ellipse cx="47" cy="29" rx="6.5" ry="3.6" transform="rotate(28 47 29)" fill="#a8714f"/>
        <ellipse cx="32" cy="38" rx="14" ry="15" fill="#b07a55"/>
        <ellipse cx="32" cy="46" rx="9.5" ry="7" fill="#ecd2b3"/>
        <path d="M24.5 35q2.5-3 5 0M34.5 35q2.5-3 5 0" fill="none" stroke="#3b2a20" stroke-width="2" stroke-linecap="round"/>
        <circle cx="22.5" cy="40" r="2.5" fill="#f7a8b0" opacity="0.85"/>
        <circle cx="41.5" cy="40" r="2.5" fill="#f7a8b0" opacity="0.85"/>
        <circle cx="32" cy="43" r="4" fill="#e3242b"/>
        <circle cx="30.7" cy="41.7" r="1.2" fill="#fff" opacity="0.85"/>
        <path d="M29.5 48q2.5 2 5 0" fill="none" stroke="#4a2e20" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="20" y="51.5" width="24" height="4.5" rx="2.2" fill="#d4282f"/>
        <circle cx="32" cy="57.5" r="3" fill="#e3c26a"/>
        <ellipse cx="14" cy="56" rx="5" ry="4" fill="#5b3a29"/>
        <ellipse cx="50" cy="56" rx="5" ry="4" fill="#5b3a29"/>`,
    },
    {
      label: '雪だるま',
      say: '練習がんばって！',
      svg: `
        <rect x="22" y="12" width="20" height="13" rx="1.5" fill="#2b2b2b"/>
        <rect x="22" y="20" width="20" height="3" fill="#d4282f"/>
        <rect x="16" y="24.5" width="32" height="4" rx="2" fill="#2b2b2b"/>
        <circle cx="32" cy="41" r="14" fill="#ffffff" stroke="#d3e1ee" stroke-width="1.5"/>
        <circle cx="27" cy="37.5" r="1.9" fill="#2b2b2b"/>
        <circle cx="37" cy="37.5" r="1.9" fill="#2b2b2b"/>
        <path d="M32 40.5l9 2-9 2Z" fill="#f08a24"/>
        <circle cx="23" cy="43" r="2.4" fill="#f7a8b0" opacity="0.8"/>
        <circle cx="41" cy="43" r="2.4" fill="#f7a8b0" opacity="0.8"/>
        <path d="M28 47.5q4 3 8 0" fill="none" stroke="#2b2b2b" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M19 52q13 6 26 0v4.5q-13 5.5-26 0Z" fill="#2f7d4f"/>
        <rect x="38" y="54" width="5" height="9" rx="2" fill="#2f7d4f"/>
        <path d="M19 55 8 49M11 50.5 8 46M45 55l11-6M53 50.5l3-4.5" fill="none" stroke="#7a5236" stroke-width="2.2" stroke-linecap="round"/>`,
    },
    {
      label: 'クリスマスツリー',
      say: 'キラキラ✨',
      svg: `
        <path d="M32 14 16 34h7L13 48h9L10 60h44L42 48h9L41 34h7Z" fill="#2f8a52"/>
        <path d="M32 14 16 34h7L13 48h9L10 60h22Z" fill="#3a9d60" opacity="0.6"/>
        <path d="M20 40q12 6 24-2M17 53q15 6 30-2" fill="none" stroke="#f1d48a" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="26" cy="31" r="2.4" fill="#e3242b"/>
        <circle cx="38" cy="36" r="2.4" fill="#3b82f6"/>
        <circle cx="24" cy="46" r="2.4" fill="#f1d48a"/>
        <circle cx="40" cy="49" r="2.4" fill="#e3242b"/>
        <circle cx="31" cy="55" r="2.4" fill="#a855f7"/>
        <path class="xmas-star" d="M32 4l2.6 5.4 5.9.8-4.3 4.1 1 5.8L32 17.3l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" fill="#ffd54a"/>`,
    },
  ];
  FRIENDS.forEach((friend, i) => {
    const el = document.createElement('button');
    el.className = 'xmas-santa';
    el.style.left = `${12 + i * 60}px`;
    el.style.animationDelay = `${i * 2.6}s`; // 順番に顔を出す
    el.setAttribute('aria-label', friend.label);
    el.innerHTML = `<span class="xmas-bubble">${friend.say}</span><svg viewBox="0 0 64 64" aria-hidden="true">${friend.svg}</svg>`;
    el.addEventListener('click', () => {
      el.classList.remove('hop');
      void el.offsetWidth; // 何度押しても、はじめから跳ねる
      el.classList.add('hop');
      burst(el);
    });
    document.body.appendChild(el);
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 動きを減らす設定の人には雪を降らせない

  const box = document.createElement('div');
  box.className = 'xmas-snow';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const flake = document.createElement('i');
    const crystal = i % 4 === 0; // 4つに1つは結晶の形
    if (crystal) {
      flake.className = 'crystal';
      flake.textContent = '❄';
    }
    const size = crystal ? 12 + Math.random() * 8 : 2 + Math.random() * 4;
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
