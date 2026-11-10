// 隠しページ：上の「残響」のロゴを 3 秒以内に 5 回たたくと開く（中身はこれから変わる予定）
// 動画は開いたときにだけ読み込み、閉じたら止める

(function () {
  const VIDEOS = [
    {
      id: 's70QzgadGv4',
      title: '高松ミュージックブルーフェス 2026',
    },
    {
      id: 'ds32r6ToNsU',
      title: '高松ミュージックブルーフェス 2025 アンサンブル',
      program: ['銀河鉄道999', 'ケセラセラ', 'カヴァレリア', 'パイレーツ・オブ・カリビアン', 'にじ', '瀬戸の花嫁', 'ひこうき雲', 'ひまわりの約束', 'オー・シャンゼリゼ', '虹'],
    },
    {
      id: 'eoiEKFccljY',
      title: '高松ミュージックブルーフェス 2024 5重奏',
      program: ['ハトと少年', 'MELA!', '人生のメリーゴーランド', '魔女の宅急便', 'Bye-Good-Bye', '虹'],
    },
  ];

  function renderVideos() {
    const box = $('zkVideos');
    box.innerHTML = '';
    VIDEOS.forEach((v) => {
      const item = document.createElement('article');
      item.className = 'zk-video';
      const frame = document.createElement('div');
      frame.className = 'zk-frame';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1`;
      iframe.title = `残響 ${v.title}`;
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube はどのサイトから開いたかが分からないと再生しない
      frame.appendChild(iframe);
      const title = document.createElement('h3');
      title.textContent = v.title;
      item.append(frame, title);
      if (v.program) {
        const list = document.createElement('p');
        list.className = 'zk-program';
        list.textContent = v.program.join(' ・ ');
        item.appendChild(list);
      }
      box.appendChild(item);
    });
  }

  function openZankyo() {
    stopMetronome();
    renderVideos();
    renderSharedRecordings();
    $('zankyoView').hidden = false;
    $('zankyoView').scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function closeZankyo() {
    $('zankyoView').hidden = true;
    $('zkVideos').innerHTML = ''; // 再生中の動画も止める
    clearSharedRecordings();
    document.body.style.overflow = '';
  }

  let taps = [];
  document.querySelector('.brand-logo').addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 3000).concat(now);
    if (taps.length < 5) return;
    taps = [];
    openZankyo();
  });
  $('closeZankyo').addEventListener('click', closeZankyo);
})();
