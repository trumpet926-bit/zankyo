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
    const refId = room.referenceId();
    box.innerHTML = '';
    Object.entries(members).forEach(([id, m]) => {
      const chip = document.createElement('span');
      chip.className = 'member' + (id === settings.syncId ? ' me' : '');
      chip.textContent = m.name;
      if (id === refId) {
        const mark = document.createElement('span');
        mark.className = 'ref-mark';
        mark.textContent = '基準';
        chip.appendChild(mark);
      }
      box.appendChild(chip);
    });
    renderCalib();
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
    $('syncCalibLive').hidden = true;
    $('syncCalibResult').hidden = true;
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
  function offsetText(ms) {
    return `${ms > 0 ? '+' : ''}${ms} ms`;
  }

  function showOffset() {
    $('syncOffset').value = settings.syncOffsetMs;
    $('syncOffsetValue').textContent = offsetText(settings.syncOffsetMs);
  }
  $('syncOffset').addEventListener('input', (e) => {
    settings.syncOffsetMs = Number(e.target.value);
    saveSettings(settings);
    showOffset();
    if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state));
  });
  showOffset();

  // ---------- 基準の台に自動で合わせる ----------
  let calibrating = false;
  let calibScheduled = null;
  let calibLiveTimer = null;

  function renderCalib() {
    const refId = room.referenceId();
    const ref = refId && room.members[refId];
    const isRef = refId === settings.syncId;
    $('syncCalib').hidden = isRef || !ref;
    $('syncCalibNote').textContent = isRef
      ? 'この台が基準です。ほかの人が音合わせをするときは、この台からも「ピッ」と鳴ります。画面を開いたままにしてください。'
      : ref
        ? `基準は ${ref.name}さんの台です。ボタンを押すと、基準の台と自分の台から音が${CALIB_BEATS}回鳴ります（約${Math.round((CALIB_BEATS * CALIB_INTERVAL_MS) / 1000)}秒）。その間は楽器を吹かずに静かにしてください。結果はこの端末に記録されるので、毎回やる必要はありません。`
        : '';
  }

  function showCalibResult(text, kind = '') {
    const box = $('syncCalibResult');
    box.textContent = text;
    box.className = `note ${kind}`;
    box.hidden = false;
  }

  // 部屋の時刻（ミリ秒）に音が耳に届くよう、スピーカーの遅れの分だけ早めた時刻
  function soundTimeOf(serverMs) {
    return toCtxTime(serverMs) - audioLead();
  }

  // 誰かが音合わせを始めたら、全員のメトロノームを止め、基準の台と合わせる台は短い音を鳴らす
  room.onCalib = (c) => {
    clearTimeout(calibLiveTimer);
    const now = room.serverNow();
    if (!c || c.endAt < now) {
      $('syncCalibLive').hidden = true;
      return;
    }
    const ctx = getAudioContext();
    ctx.resume();
    metronome.muteFrom = soundTimeOf(c.startAt) - 0.15;
    metronome.muteTo = soundTimeOf(c.endAt) + 0.15;

    const mine = c.id === settings.syncId;
    const isRef = room.referenceId() === settings.syncId;
    const freq = mine ? CALIB_SELF_HZ : isRef ? CALIB_REF_HZ : 0;
    const key = `${c.id}:${c.startAt}`;
    if (freq && calibScheduled !== key) {
      calibScheduled = key;
      for (let i = 0; i < CALIB_BEATS; i++) {
        const time = soundTimeOf(c.startAt + i * CALIB_INTERVAL_MS);
        if (time > ctx.currentTime) playCalibBeep(ctx, ctx.destination, freq, time);
      }
    }
    if (!mine) {
      $('syncCalibLive').textContent = isRef
        ? `${c.name}さんが音合わせ中です。この台（基準）からも音が鳴ります。`
        : `${c.name}さんが音合わせ中です。少しの間、静かにしてください。`;
      $('syncCalibLive').hidden = false;
      calibLiveTimer = setTimeout(() => { $('syncCalibLive').hidden = true; }, c.endAt - now + 500);
    }
  };

  async function autoCalibrate() {
    if (calibrating) return;
    calibrating = true;
    $('syncCalib').disabled = true;
    showCalibResult('マイクを準備しています…');
    getAudioContext().resume(); // iPhone は画面を触ったときにしか音を出せないため、ここで準備する
    let stream = null;
    let capture = null;
    try {
      try {
        stream = await openMicrophone();
      } catch (e) {
        throw new CalibError('マイクを使えませんでした。マイクの使用を許可してください。');
      }
      capture = startCalibCapture(stream);
      let calib;
      try {
        calib = await room.startCalib();
      } catch (e) {
        throw new CalibError('音合わせを始められませんでした。もう一度お試しください。');
      }
      if (!calib) throw new CalibError('ほかの人が音合わせ中です。終わってからもう一度押してください。');
      showCalibResult('音合わせ中です。静かにしてください…');
      await new Promise((resolve) => setTimeout(resolve, calib.endAt - room.serverNow() + 600));
      const samples = capture.stop();
      capture = null;
      const lag = measureCalibLag(samples, getAudioContext().sampleRate);

      // 自分の音が遅れて届いていた分だけ、早めに鳴らす
      const before = settings.syncOffsetMs;
      const wanted = Math.round((before - lag) / 5) * 5;
      settings.syncOffsetMs = Math.max(-200, Math.min(200, wanted));
      saveSettings(settings);
      showOffset();
      if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state));

      const size = Math.round(Math.abs(lag));
      const found = size < 3 ? `基準の台とほぼぴったりでした（ずれ ${size} ms）。` : `自分の音が基準より ${size} ms ${lag > 0 ? '遅れて' : '早く'}聞こえていました。`;
      const limit = settings.syncOffsetMs !== wanted ? '（補正できるいちばん端までにしました）' : '';
      showCalibResult(`${found}補正を ${offsetText(settings.syncOffsetMs)} にしました${limit}。途中でずれを感じたら、下のバーで調整してください。`, 'ok');
    } catch (e) {
      showCalibResult(e instanceof CalibError ? e.message : 'うまく測れませんでした。もう一度お試しください。', 'fail');
    } finally {
      if (capture) capture.stop();
      if (stream) closeMicrophone(stream);
      room.endCalib();
      calibrating = false;
      $('syncCalib').disabled = false;
    }
  }

  $('syncCalib').addEventListener('click', autoCalibrate);

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
