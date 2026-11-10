// タップで合わせる（オンライン合奏用）：離れた場所の人と合わせるときの、ひとりでできるタイミング補正
// イヤホンでカッ・カッ…を聞きながら画面をタップしてもらい、「鳴らした時刻」から「耳に届いてタップした時刻」までの遅れを測る。
// 一緒にいるときは「基準の台に自動で合わせる」（音を聞き比べる）のほうが正確

(function () {
  const CLICKS = 20; // 鳴らす回数
  const WARMUP = 4; // はじめの数回は慣れるまでの分として数えない
  const INTERVAL = 0.7; // 間隔（秒）。Bluetooth の大きな遅れでも、前後の音と取り違えない長さ
  let clicks = []; // 鳴らした時刻（AudioContext の秒）
  let taps = [];
  let running = false;
  let endTimer = null;

  // スピーカー（イヤホン）から音が出るまでの遅れとして、ブラウザが教えてくれる値（秒）
  function audioLead() {
    const ctx = getAudioContext();
    return ctx.outputLatency || ctx.baseLatency || 0;
  }

  function open() {
    $('tapCal').hidden = false;
    document.body.style.overflow = 'hidden';
    showIntro();
  }

  function close() {
    stop();
    $('tapCal').hidden = true;
    document.body.style.overflow = '';
  }

  function showIntro() {
    $('tapCalNote').textContent = 'イヤホンをつけて「はじめる」を押してください。カッ・カッ…という音が20回鳴ります。音に合わせて、下の大きな丸をタップします（画面は見ずに、耳だけで合わせるのがコツです）。';
    $('tapCalCount').textContent = '';
    $('tapCalPad').disabled = true;
    $('tapCalStart').textContent = 'はじめる';
    $('tapCalStart').hidden = false;
  }

  function stop() {
    running = false;
    clearTimeout(endTimer);
    $('tapCalPad').classList.remove('active');
  }

  async function start() {
    const ctx = getAudioContext();
    await ctx.resume();
    clicks = [];
    taps = [];
    const first = ctx.currentTime + 1.2;
    for (let i = 0; i < CLICKS; i++) {
      const t = first + i * INTERVAL;
      clicks.push(t);
      playClick(ctx, audioOutput(ctx), t, i % 4 === 0);
    }
    // 測っている間は、メトロノームの音を止める（音が混ざらないように）
    metronome.muteFrom = first - 0.3;
    metronome.muteTo = first + CLICKS * INTERVAL;
    running = true;
    $('tapCalStart').hidden = true;
    $('tapCalPad').disabled = false;
    $('tapCalPad').classList.add('active');
    $('tapCalNote').textContent = '音に合わせて、丸をタップしてください。';
    renderCount();
    endTimer = setTimeout(finish, (first - ctx.currentTime + CLICKS * INTERVAL + 0.3) * 1000);
  }

  function renderCount() {
    const counted = taps.filter((t) => t >= clicks[WARMUP] - 0.2).length;
    $('tapCalCount').textContent = `${Math.min(counted, CLICKS - WARMUP)} / ${CLICKS - WARMUP}`;
  }

  // 指が触れた瞬間の時刻を、音の時計（AudioContext の秒）に直して記録する
  $('tapCalPad').addEventListener('pointerdown', (e) => {
    if (!running) return;
    e.preventDefault();
    const ctx = getAudioContext();
    taps.push(ctx.currentTime - (performance.now() - e.timeStamp) / 1000);
    const pad = $('tapCalPad');
    pad.classList.remove('hit');
    void pad.offsetWidth;
    pad.classList.add('hit');
    renderCount();
  });

  function finish() {
    stop();
    $('tapCalPad').disabled = true;
    // それぞれのタップを、直前（少し後ろも含む）に鳴らした音と組にして、ずれを求める
    const diffs = [];
    const used = new Set();
    taps.forEach((tap) => {
      const j = Math.floor((tap - clicks[0] + 0.2) / INTERVAL);
      if (j < WARMUP || j >= CLICKS || used.has(j)) return;
      used.add(j);
      diffs.push(tap - clicks[j]);
    });
    $('tapCalStart').textContent = 'もう一度';
    $('tapCalStart').hidden = false;
    if (diffs.length < 8) {
      $('tapCalNote').textContent = 'タップが少なかったので、測れませんでした。もう一度、音に合わせて16回タップしてください。';
      return;
    }
    diffs.sort((a, b) => a - b);
    const mid = diffs[Math.floor(diffs.length / 2)];
    const spread = diffs[Math.floor(diffs.length * 0.75)] - diffs[Math.floor(diffs.length * 0.25)];
    if (spread > 0.08) {
      $('tapCalNote').textContent = 'タップのばらつきが大きかったので、補正は変えていません。もう一度、落ち着いて音に合わせてみてください。';
      return;
    }
    // 耳に届くまでの本当の遅れ（mid）と、ブラウザが見込んでいる遅れ（audioLead）の差だけ、早めに鳴らす
    const wanted = Math.round(((audioLead() - mid) * 1000) / 5) * 5;
    const offset = Math.max(-400, Math.min(200, wanted));
    syncHooks.setOffset(offset);
    usage.track('tapcalib');
    $('tapCalNote').textContent = `音が耳に届くまで、約 ${Math.round(mid * 1000)} ms かかっていました。補正を ${offset > 0 ? '+' : ''}${offset} ms にしました。合奏中にずれを感じたら、「みんなで合わせる」の補正のバーで微調整できます。`;
  }

  $('tapCalStart').addEventListener('click', start);
  $('tapCalClose').addEventListener('click', close);
  $('openTapCal').addEventListener('click', open);
  $('ensTapCal').addEventListener('click', open);
})();
