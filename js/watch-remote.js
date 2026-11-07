// 時計（Garmin）からの操作を受け取る
// 時計 → Garmin Connect アプリ → Firebase の remote/{番号}/cmd に命令が届き、ここで実行する。
// 今の状態（テンポ・鳴っているか・録音中か）を remote/{番号}/status に書いて、時計に見せる。
// 時計の番号は、プログラムには置かず、一度だけ ?watch=番号 のリンクで開いてこの端末に覚えさせる

(function () {
  const KEY = 'practice-app-watch';
  let remoteId = null;
  try {
    const fromUrl = new URLSearchParams(location.search).get('watch');
    if (fromUrl && /^[a-z0-9]{24}$/.test(fromUrl)) {
      localStorage.setItem(KEY, fromUrl);
      history.replaceState(null, '', location.pathname); // 番号をアドレス欄に残さない
    }
    remoteId = localStorage.getItem(KEY);
  } catch (e) {
    remoteId = null;
  }
  // 隠しページの「貼り付けて登録」：コピーしておいた番号で登録する（登録していない端末でも使えるよう、先に用意する）
  $('watchPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const m = /([a-z0-9]{24})/.exec(text.replace(/^zankyo-watch:/, ''));
      if (!m) throw new Error('no code');
      localStorage.setItem(KEY, m[1]);
      $('watchPasteNote').textContent = '登録しました。メトロノームの画面のいちばん下に「時計で操作」が出ます。';
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      $('watchPasteNote').textContent = '番号が見つかりませんでした。先に、登録した方の画面で番号をコピーしてください。';
    }
  });

  if (!remoteId) return; // 時計を登録していない人には、何も出さない

  $('watchCard').hidden = false;
  let listening = false;
  let cmdRef = null;
  let statusRef = null;
  let lastSeq = null;
  let alive = 0;
  let statusTimer = null;
  let recFailedUntil = 0; // 録音を始められなかったことを、しばらく時計に知らせる

  function writeStatus() {
    if (!statusRef) return;
    const recording = recorder.isRecording;
    alive++;
    statusRef.set({
      bpm: settings.bpm,
      running: metronome.isRunning,
      recording,
      // 録音を始めた正確な時刻からの秒数（時計はこれをもとに、自分で1秒ずつ数える）
      rec: recording ? Math.floor((performance.now() - recorder.startedAt) / 1000) : Date.now() < recFailedUntil ? -1 : 0,
      alive,
    }).catch(() => {});
  }

  function run(cmd) {
    if (cmd === 'toggle') toggleMetronomeByUser();
    else if (cmd === 'up1') setBpm(settings.bpm + 1);
    else if (cmd === 'down1') setBpm(settings.bpm - 1);
    else if (cmd === 'up5') setBpm(settings.bpm + 5);
    else if (cmd === 'down5') setBpm(settings.bpm - 5);
    else if (cmd === 'rec') toggleRecording();
    setTimeout(writeStatus, 300);
  }

  async function toggleRecording() {
    if (recorder.isRecording) {
      stopRecording();
      return;
    }
    const ok = await startRecording(); // 受け付け中は、開いたままのマイク（sharedMic）を使う
    if (!ok) recFailedUntil = Date.now() + 8000; // 時計に「REC failed」と出す
    writeStatus();
  }

  async function start() {
    $('watchToggle').disabled = true;
    getAudioContext().resume(); // 画面を触ったときでないと音を出せないため、ここで準備する
    // iPhone は画面を触ったときでないとマイクを開けないので、ここで開いて、受け付けている間は開いたままにする
    // （sharedMic は app.js にあり、録音ボタンからの録音でも同じマイクを使う）
    try {
      sharedMic = await openMicrophone();
    } catch (e) {
      sharedMic = null; // 許可されなくても、メトロノームとテンポの操作はできる
    }
    try {
      const db = await SyncRoom.database();
      const base = db.ref(`remote/${remoteId}`);
      cmdRef = base.child('cmd');
      statusRef = base.child('status');
      let primed = false;
      lastSeq = null;
      cmdRef.on('value', (snap) => {
        const c = snap.val();
        if (!primed) {
          primed = true; // 最初に届くのは、受け付けを始める前の命令（実行しない）
          lastSeq = c ? c.seq : null;
          return;
        }
        if (!c || c.seq === lastSeq) return;
        lastSeq = c.seq;
        run(c.cmd);
      });
      statusTimer = setInterval(writeStatus, 2000);
      writeStatus();
      listening = true;
      holdScreen = true; // 画面が消えると受け取れないので、つけたままにする
      keepScreenOn(true);
    } catch (e) {
      $('watchNote').textContent = 'つながりませんでした。インターネットにつながっているか確認してください。';
    }
    $('watchToggle').disabled = false;
    render();
  }

  async function stop() {
    if (recorder.isRecording) await stopRecording(); // 録音中なら、保存してからマイクを閉じる
    if (cmdRef) cmdRef.off();
    clearInterval(statusTimer);
    cmdRef = null;
    statusRef = null;
    listening = false;
    if (sharedMic) {
      closeMicrophone(sharedMic);
      sharedMic = null;
    }
    holdScreen = false;
    if (!metronome.isRunning) keepScreenOn(false);
    render();
  }

  function render() {
    $('watchToggle').textContent = listening ? '受け付けをやめる' : '時計からの操作を受け付ける';
    $('watchToggle').className = listening ? 'btn danger full-width' : 'btn primary full-width';
    $('watchNote').textContent = listening
      ? '受け付け中です。この画面を開いたまま（画面が消えないようにしています）、時計で操作してください。'
      : '押すと、時計（Venu 3）からメトロノームのスタート／ストップ、テンポ、録音を操作できます。';
  }

  $('watchToggle').addEventListener('click', () => (listening ? stop() : start()));

  // iPhone では Safari とホーム画面のアプリの記録が別々なので、番号をコピーして、もう一方に貼り付けて登録できるようにする
  $('watchCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`zankyo-watch:${remoteId}`);
      $('watchCopyNote').hidden = false;
    } catch (e) {
      $('watchCopyNote').textContent = 'コピーできませんでした。';
      $('watchCopyNote').hidden = false;
    }
  });
  // アプリに戻ってきたら、画面を消さない設定をかけ直す（離れると外れるため）
  document.addEventListener('visibilitychange', () => {
    if (listening && document.visibilityState === 'visible') keepScreenOn(true);
  });
  render();
})();
