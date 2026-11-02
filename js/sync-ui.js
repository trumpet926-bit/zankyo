// みんなで合わせる：画面の操作

(function () {
  const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const ACTION_TEXT = {
    create: () => 'が部屋を作りました',
    start: () => 'がスタート',
    stop: () => 'がストップ',
    tempo: (s) => `がテンポを${s.bpm}に変更`,
    beats: (s) => `が拍子を${s.beats}拍に変更`,
  };

  // この端末の番号と名前は、初回に決めてずっと使う
  if (!settings.syncId) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    settings.syncId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
  }
  if (!settings.syncName) settings.syncName = EDO_NAMES[Math.floor(Math.random() * EDO_NAMES.length)];
  saveSettings(settings);

  const room = new SyncRoom(settings.syncId, settings.syncName);
  let following = false; // この端末のメトロノームが部屋の時間軸で鳴っているか
  let bpmTimer = null;
  let realignTimer = null;
  let clockTimer = null;
  let joinedAt = 0;

  // ---------- メトロノームの操作を部屋に送る ----------
  syncHooks.active = () => !!room.code && !!room.state;
  syncHooks.toggle = () => {
    getAudioContext().resume(); // iPhone は画面を触ったときにしか音を出せないため、ここで準備する
    room.toggleRunning();
  };
  // ボタンの連打やタップテンポで何度も送らないよう、指を止めてから送る
  syncHooks.bpm = (bpm) => {
    clearTimeout(bpmTimer);
    bpmTimer = setTimeout(() => {
      bpmTimer = null;
      room.setBpm(bpm);
    }, 400);
  };
  syncHooks.beats = (beats) => room.setBeats(beats);

  // スピーカーから音が出るまでの遅れ（秒）
  function audioLead() {
    const ctx = getAudioContext();
    return ctx.outputLatency || ctx.baseLatency || 0;
  }

  // サーバーの時刻（ミリ秒）を、音の時計（AudioContext の秒）に直す
  function toCtxTime(serverMs) {
    const ctx = getAudioContext();
    return ctx.currentTime + (serverMs + settings.syncOffsetMs - room.serverNow()) / 1000;
  }

  function timelineOf(s) {
    return { anchor: toCtxTime(s.anchorAt), bpm: s.bpm, beats: s.beats };
  }

  async function follow(s) {
    stopMetronome();
    following = true;
    renderBeatDots(s.beats);
    await metronome.startSynced(timelineOf(s), audioLead());
    showMetronomeRunning(true);
  }

  function unfollow() {
    following = false;
    stopMetronome();
  }

  // ---------- 部屋の状態が変わったとき ----------
  room.onState = (s, prev) => {
    settings.bpm = s.bpm;
    settings.beats = s.beats;
    saveSettings(settings);
    if (!bpmTimer) showBpm(s.bpm); // 自分がテンポを動かしている最中は、表示を戻さない
    $('beatsSelect').value = s.beats;
    renderMessage(s);

    if (!s.running) {
      unfollow();
      metronome.bpm = s.bpm;
      metronome.beats = s.beats;
      renderBeatDots(s.beats);
      return;
    }
    if (!metronome.isRunning || !following) {
      follow(s);
      return;
    }
    const changed = !prev || !prev.running || prev.anchorAt !== s.anchorAt || prev.bpm !== s.bpm || prev.beats !== s.beats;
    if (changed) {
      metronome.changeAt(timelineOf(s));
      if (prev && prev.beats !== s.beats) {
        setTimeout(() => renderBeatDots(s.beats), Math.max(0, s.anchorAt - room.serverNow()));
      }
    }
  };

  room.onMembers = (members) => {
    const box = $('syncMembers');
    box.innerHTML = '';
    Object.entries(members).forEach(([id, m]) => {
      const chip = document.createElement('span');
      chip.className = 'member' + (id === settings.syncId ? ' me' : '');
      chip.textContent = m.name;
      box.appendChild(chip);
    });
  };

  function renderMessage(s) {
    const text = ACTION_TEXT[s.action] ? `${s.by}さん${ACTION_TEXT[s.action](s)}` : '';
    const msg = $('syncMessage');
    msg.textContent = text;
    if (s.at > joinedAt) {
      msg.classList.remove('fresh');
      void msg.offsetWidth;
      msg.classList.add('fresh');
    }
    $('bigRoom').textContent = `部屋 ${room.code} ・ ${room.name}\n${text}`;
  }

  // ---------- 部屋を作る・入る・出る ----------
  function showError(message) {
    $('syncError').textContent = message;
    $('syncError').hidden = !message;
  }

  async function connect(task) {
    showError('');
    $('syncStatus').textContent = '接続しています…';
    $('syncStatus').hidden = false;
    $('syncCreate').disabled = true;
    $('syncJoin').disabled = true;
    getAudioContext().resume();
    try {
      await task();
    } catch (e) {
      room.leave();
      showError('つながりませんでした。インターネットにつながっているか確認してください。');
    } finally {
      $('syncStatus').hidden = true;
      $('syncCreate').disabled = false;
      $('syncJoin').disabled = false;
    }
  }

  function entered() {
    joinedAt = room.serverNow();
    $('syncOut').hidden = true;
    $('syncIn').hidden = false;
    $('syncCode').textContent = room.code;
    $('syncMe').textContent = room.name;
    $('bigRoom').hidden = false;
    // 端末の時計はわずかに進み方が違うので、ときどき合わせ直す
    realignTimer = setInterval(() => {
      if (following && metronome.isRunning && room.state && room.state.running) {
        metronome.realign(timelineOf(room.state));
      }
    }, 10000);
    clockTimer = setInterval(() => room.measureClock().catch(() => {}), 120000);
  }

  $('syncCreate').addEventListener('click', () => connect(async () => {
    unfollow();
    await room.create({ bpm: settings.bpm, beats: settings.beats, running: false });
    entered();
  }));

  $('syncJoin').addEventListener('click', () => connect(async () => {
    const code = $('syncCodeInput').value.replace(/\D/g, '');
    if (code.length !== 6) {
      showError('6桁の番号を入力してください。');
      return;
    }
    unfollow();
    if (!(await room.join(code))) {
      showError('その番号の部屋は見つかりませんでした。');
      return;
    }
    entered();
  }));

  $('syncLeave').addEventListener('click', () => {
    room.leave();
    clearInterval(realignTimer);
    clearInterval(clockTimer);
    unfollow();
    metronome.bpm = settings.bpm;
    metronome.beats = settings.beats;
    renderBeatDots();
    $('syncIn').hidden = true;
    $('syncOut').hidden = false;
    $('syncQr').hidden = true;
    $('bigRoom').hidden = true;
  });

  // アプリに戻ってきたら、時計を測り直して合わせ直す（iPhone は裏にいる間止まるため）
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !room.code) return;
    try {
      await room.measureClock();
    } catch (e) {
      return;
    }
    if (room.state && room.state.running) follow(room.state);
  });

  // ---------- 音のタイミング補正 ----------
  function showOffset() {
    $('syncOffset').value = settings.syncOffsetMs;
    $('syncOffsetValue').textContent = `${settings.syncOffsetMs > 0 ? '+' : ''}${settings.syncOffsetMs} ms`;
  }
  $('syncOffset').addEventListener('input', (e) => {
    settings.syncOffsetMs = Number(e.target.value);
    saveSettings(settings);
    showOffset();
    if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state));
  });
  showOffset();

  // ---------- 招待（QRコードとリンク） ----------
  function inviteUrl() {
    return `${location.origin}${location.pathname}?room=${room.code}&openExternalBrowser=1`;
  }

  $('syncInviteBtn').addEventListener('click', async () => {
    const box = $('syncQr');
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.innerHTML = '<p class="note">QRコードを準備しています…</p>';
    box.hidden = false;
    try {
      if (!window.qrcode) await loadScript(QR_LIB);
      const qr = qrcode(0, 'M');
      qr.addData(inviteUrl());
      qr.make();
      box.innerHTML = `<div class="qr-image">${qr.createSvgTag(5, 2)}</div>` +
        '<p class="note">カメラで読み取ると、この部屋に入れます。</p>' +
        '<button class="btn small" id="syncShare">リンクを送る</button>';
    } catch (e) {
      box.innerHTML = '<button class="btn small" id="syncShare">リンクを送る</button>';
    }
    $('syncShare').addEventListener('click', async () => {
      const text = `残響 PracticeTool の部屋「${room.code}」に入ってください`;
      if (navigator.share) {
        navigator.share({ title: '残響 PracticeTool', text, url: inviteUrl() }).catch(() => {});
      } else {
        try {
          await navigator.clipboard.writeText(`${text}\n${inviteUrl()}`);
          $('syncShare').textContent = 'リンクをコピーしました';
        } catch (e) {
          prompt('このリンクをコピーして送ってください', inviteUrl());
        }
      }
    });
  });

  // 招待のリンクから開いたときは、部屋の番号を入れておく
  const invited = new URLSearchParams(location.search).get('room');
  if (invited && /^\d{6}$/.test(invited)) {
    $('syncCodeInput').value = invited;
    $('syncInvite').textContent = `部屋「${invited}」に招待されています。「部屋に入る」を押してください。`;
    $('syncInvite').classList.add('invited');
    $('syncJoin').className = 'btn primary';
    $('syncCreate').className = 'btn full-width';
  }
})();
