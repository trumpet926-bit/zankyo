// みんなで合わせる：画面の操作

(function () {
  const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const ACTION_TEXT = {
    create: () => 'が部屋を作りました',
    start: () => 'がスタート',
    stop: () => 'がストップ',
    tempo: (s) => `がテンポを${s.bpm}に変更`,
    beats: (s) => `が拍子を${s.beats}拍に変更`,
    countin: (s) => (s.countIn ? 'が「音で合わせる」をオンにしました' : 'が「音で合わせる」をオフにしました'),
  };

  // この端末の番号と名前は、初回に決めてずっと使う
  if (!settings.syncId) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    settings.syncId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
  }
  if (!settings.syncName) settings.syncName = EDO_NAMES[Math.floor(Math.random() * EDO_NAMES.length)];
  saveSettings(settings);

  const room = new SyncRoom(settings.syncId, settings.syncName);
  syncHooks.room = room;
  let following = false; // この端末のメトロノームが部屋の時間軸で鳴っているか
  let bpmTimer = null;
  let realignTimer = null;
  let realignTick = 0;
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
  // スピーカーから音が出るまでの遅れ（秒）。その分だけ早めに鳴らす。
  // 端末が知らせる値は読むたびにぶれるので、最初に読めた値をこの端末の値として保存し、ずっと同じ値を使う。
  // （毎回読み直すと、スタートのたびにずれ方が変わり、音合わせの結果も合わなくなる）
  // 本当の遅れとの差は、音合わせ（自動・タップ）の補正がまとめて埋める
  function audioLead() {
    if (typeof settings.syncLeadMs === 'number') return settings.syncLeadMs / 1000;
    const ctx = getAudioContext();
    const reading = ctx.outputLatency || ctx.baseLatency || 0;
    if (ctx.state === 'running' && reading > 0) {
      settings.syncLeadMs = Math.round(reading * 1000);
      saveSettings(settings);
    }
    return reading;
  }
  syncHooks.audioLead = audioLead;

  // サーバーの時刻（ミリ秒）を、音の時計（AudioContext の秒）に直す
  // 音の時計（AudioContext）と端末の時計の関係。音の時計は細かい区切りごとにしか進まないので、
  // 1回の読み取りでは数ミリ秒ぶれる。読み取りを何度も記録し、いちばん小さい値（読んだ瞬間に近い）を使う
  // 音の時計が止まっていたとき（アプリが裏にいた・音の準備前・音の出口が変わった）は、それまでの記録を捨てる。
  // 古い記録を使い続けると、10秒ほど拍の位置がずれたまま鳴ってしまう
  const clockMap = []; // { lag, at }（秒）
  function ctxLag() {
    const ctx = getAudioContext();
    const now = performance.now() / 1000;
    const lag = now - ctx.currentTime;
    if (ctx.state !== 'running') {
      clockMap.length = 0; // 止まっている間は記録しない（動き出すと、止まった所から進む）
      return lag;
    }
    while (clockMap.length && now - clockMap[0].at > 10) clockMap.shift(); // ここ10秒の記録だけ使う
    const min = clockMap.length ? Math.min(...clockMap.map((m) => m.lag)) : lag;
    if (lag - min > 0.06) clockMap.length = 0; // 急に大きくなった＝音の時計がしばらく止まっていた
    clockMap.push({ lag, at: now });
    return Math.min(...clockMap.map((m) => m.lag));
  }

  function toCtxTime(serverMs) {
    // サーバーの時刻 → この端末の時計（ミリ秒）→ 音の時計（秒）
    const wallMs = serverMs + settings.syncOffsetMs - room.offset;
    return (wallMs - performance.timeOrigin) / 1000 - ctxLag();
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
    $('ensBeats').value = s.beats;
    $('syncCountIn').checked = !!s.countIn;
    renderMessage(s);
    // 音で合わせる：スタートした直後なら、カウントインのピッを鳴らして聞き取る
    if (s.running && s.countIn && (!prev || !prev.running)) runCountIn(s);

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
      chip.innerHTML = edoFaceSvg(m.name, 28);
      chip.append(m.name);
      if (id === refId) {
        const mark = document.createElement('span');
        mark.className = 'ref-mark';
        mark.textContent = '基準';
        chip.appendChild(mark);
      }
      box.appendChild(chip);
    });
    renderCalib();
    if (room.code) usage.room(room.code, Object.keys(members).length);
    if (syncHooks.onMembers) syncHooks.onMembers();
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
    usage.track('sync');
    joinedAt = room.serverNow();
    $('syncOut').hidden = true;
    $('syncIn').hidden = false;
    $('syncCode').textContent = room.code;
    $('syncMe').textContent = room.name;
    $('syncMeFace').innerHTML = edoFaceSvg(room.name, 72);
    $('syncMeRole').textContent = edoPerson(room.name).role;
    $('bigRoom').hidden = false;
    if (syncHooks.onRoomChange) syncHooks.onRoomChange();
    // 部屋にいる間は画面を消さない（基準の台が眠ると、音合わせの「ピッ」が鳴らず、合わせられなくなる）
    screenHolds.add('room');
    keepScreenOn(true);
    // 端末の時計はわずかに進み方が違うので、こまめに少しずつ合わせ直す
    clockMap.length = 0;
    realignTimer = setInterval(() => {
      room.slew(250);
      ctxLag(); // 音の時計の読み取りを記録しておく
      if (++realignTick % 8 === 0 && following && metronome.isRunning && room.state && room.state.running) {
        metronome.realign(timelineOf(room.state)); // 2秒ごと
      }
    }, 250);
    clockTimer = setInterval(() => room.refineClock().catch(() => {}), 15000);
  }

  // ---------- オンライン合奏の画面から使う ----------
  class RoomError extends Error {}

  // 戻り値：うまくいけば空の文字、だめなら画面に出す説明
  async function roomTask(task) {
    getAudioContext().resume();
    try {
      await task();
      return '';
    } catch (e) {
      room.leave();
      return e instanceof RoomError ? e.message : 'つながりませんでした。インターネットにつながっているか確認してください。';
    }
  }

  syncHooks.createRoom = () => roomTask(async () => {
    unfollow();
    await room.create({ bpm: settings.bpm, beats: settings.beats, running: false });
    entered();
  });
  syncHooks.joinRoom = (code) => roomTask(async () => {
    if (!/^\d{6}$/.test(code)) throw new RoomError('6桁の番号を入力してください。');
    unfollow();
    if (!(await room.join(code))) throw new RoomError('その番号の部屋は見つかりませんでした。');
    entered();
  });
  syncHooks.leaveRoom = () => $('syncLeave').click();
  syncHooks.isReference = () => room.referenceId() === settings.syncId;
  syncHooks.hasReference = () => !!room.referenceId();
  syncHooks.calibrate = () => autoCalibrate();

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

  // 部屋を出る。基準の台が出るときは部屋を閉じ、ほかの人も自動で出る（出忘れて電池が減り続けないように）
  function leaveRoom(closedByRef = false) {
    if (!room.code) return;
    const isRef = room.referenceId() === settings.syncId;
    if (syncHooks.onLeave) syncHooks.onLeave();
    room.leave(isRef && !closedByRef);
    clearInterval(realignTimer);
    clearInterval(clockTimer);
    unfollow();
    releaseCountInMic();
    screenHolds.delete('room');
    if (!metronome.isRunning) keepScreenOn(false);
    metronome.bpm = settings.bpm;
    metronome.beats = settings.beats;
    renderBeatDots();
    $('syncIn').hidden = true;
    $('syncOut').hidden = false;
    $('syncQr').hidden = true;
    if (syncHooks.onRoomChange) syncHooks.onRoomChange();
    $('syncCalibLive').hidden = true;
    $('syncCalibResult').hidden = true;
    $('bigRoom').hidden = true;
    showError(closedByRef ? '基準の台が部屋を閉じたので、部屋から出ました。' : '');
  }
  $('syncLeave').addEventListener('click', () => leaveRoom());
  room.onClosed = () => leaveRoom(true);

  // アプリに戻ってきたら、時計を測り直して合わせ直す（iPhone は裏にいる間止まるため）
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !room.code) return;
    keepScreenOn(true); // アプリを離れると画面をつけたままの設定が外れるので、かけ直す
    clockMap.length = 0; // 裏にいた間の音の時計の記録は使わない
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
  // タップで合わせる（tap-calib.js）から補正を決めるとき
  syncHooks.setOffset = (ms) => {
    settings.syncOffsetMs = ms;
    saveSettings(settings);
    showOffset();
    if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state), true);
  };

  $('syncOffset').addEventListener('input', (e) => {
    settings.syncOffsetMs = Number(e.target.value);
    saveSettings(settings);
    showOffset();
    if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state), true);
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
    $('syncLeave').textContent = isRef ? '部屋を閉じる' : '部屋を出る';
    const others = Object.keys(room.members).filter((id) => id !== settings.syncId).length;
    $('syncCalibAll').hidden = !isRef || others === 0;
    $('syncCalibNote').textContent = isRef
      ? `この台が基準です。「全員を順番に合わせる」を押すと、ほかの台を1台ずつ自動で合わせます（1台 約${Math.round((CALIB_BEATS * CALIB_INTERVAL_MS) / 1000) + 4}秒）。その間は静かにしてください。`
      : ref
        ? `基準は ${ref.name}さんの台です。ボタンを押すと、基準の台と自分の台から音が${CALIB_BEATS}回鳴ります（約${Math.round((CALIB_BEATS * CALIB_INTERVAL_MS) / 1000)}秒）。その間は楽器を吹かずに静かにしてください。結果はこの端末に記録されるので、毎回やる必要はありません。`
        : '';
  }

  function showCalibResult(text, kind = '') {
    if (syncHooks.onCalibStatus) syncHooks.onCalibStatus(text, kind);
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
    // 基準の台から順番で指名された：自分で押したときと同じように合わせる
    if (mine && !calibrating && c.startAt > now + 300) autoCalibrate(c);
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

  // 音合わせ。自分で押したとき（given なし）と、基準の台に順番で指名されたとき（given＝指名の内容）の両方で使う
  async function autoCalibrate(given = null) {
    if (calibrating) return;
    calibrating = true;
    $('syncCalib').disabled = true;
    showCalibResult(given ? '基準の台から順番が回ってきました。マイクを準備しています…' : 'マイクを準備しています…');
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
      usage.track(given ? 'calibremote' : 'calib');
      let calib = given;
      if (!calib) {
        try {
          calib = await room.startCalib();
        } catch (e) {
          throw new CalibError('音合わせを始められませんでした。もう一度お試しください。');
        }
        if (!calib) throw new CalibError('ほかの人が音合わせ中です。終わってからもう一度押してください。');
      }
      showCalibResult('音合わせ中です。静かにしてください…');
      await new Promise((resolve) => setTimeout(resolve, calib.endAt - room.serverNow() + 600));
      const samples = capture.stop();
      capture = null;
      const lag = measureCalibLag(samples, getAudioContext().sampleRate);
      const result = applyLag(lag, -200, 200);
      showCalibResult(`${result}途中でずれを感じたら、下のバーで調整してください。`, 'ok');
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

  // 測ったずれ（自分の音が基準より lag ミリ秒遅れて聞こえた）の分だけ補正を変え、結果の文を返す
  function applyLag(lag, min, max) {
    const before = settings.syncOffsetMs;
    const wanted = Math.round(before - lag);
    settings.syncOffsetMs = Math.max(min, Math.min(max, wanted));
    saveSettings(settings);
    showOffset();
    if (following && room.state && room.state.running) metronome.realign(timelineOf(room.state), true);
    const size = Math.round(Math.abs(lag));
    const found = size < 3 ? `基準の台とほぼぴったりでした（ずれ ${size} ms）。` : `自分の音が基準より ${size} ms ${lag > 0 ? '遅れて' : '早く'}聞こえていました。`;
    const limit = settings.syncOffsetMs !== wanted ? '（補正できるいちばん端までにしました）' : '';
    return `${found}補正を ${offsetText(settings.syncOffsetMs)} にしました${limit}。`;
  }

  // ---------- 基準の台から、全員を順番に合わせる ----------
  let calibAllRunning = false;
  async function calibrateAll() {
    if (calibAllRunning || room.referenceId() !== settings.syncId) return;
    calibAllRunning = true;
    $('syncCalibAll').disabled = true;
    usage.track('calibbatch');
    const others = Object.entries(room.members)
      .filter(([id, m]) => id !== settings.syncId && typeof m.joinedAt === 'number')
      .sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
    let done = 0;
    for (const [id, m] of others) {
      if (!room.code) break;
      if (!room.members[id]) continue; // 途中で出た人はとばす
      done++;
      showCalibResult(`${m.name}さんの台を合わせています（${done} / ${others.length}）。静かにしてください…`);
      let calib = null;
      for (let i = 0; i < 6 && !calib && room.code; i++) {
        calib = await room.startCalib(id, m.name, 2500).catch(() => null);
        if (!calib) await new Promise((r) => setTimeout(r, 1500)); // ほかの人の音合わせが終わるのを待つ
      }
      if (!calib) continue;
      await new Promise((r) => setTimeout(r, calib.endAt - room.serverNow() + 2200)); // 測って結果を出す時間も待つ
    }
    showCalibResult(room.code ? `全員（${others.length}台）の音合わせが終わりました。結果はそれぞれの端末に出ています。` : '', 'ok');
    calibAllRunning = false;
    $('syncCalibAll').disabled = false;
  }
  $('syncCalibAll').addEventListener('click', calibrateAll);

  // ---------- 音で合わせる（カウントイン） ----------
  // スタートのたびに、基準の台と全員が違う高さのピッを同時に鳴らし、各自のマイクで聞いて補正を直す。
  // 通信で合わせた時計がずれていても、1拍目までに音で直るので、回線の速さや揺れに左右されにくい
  let countInMic = null; // 部屋にいる間は開いたままにする（スタートのたびに開くと間に合わないことがある）
  async function ensureCountInMic() {
    if (countInMic && countInMic.getAudioTracks().some((t) => t.readyState === 'live')) return countInMic;
    countInMic = await openMicrophone();
    return countInMic;
  }
  function releaseCountInMic() {
    if (countInMic) closeMicrophone(countInMic);
    countInMic = null;
  }

  // 部屋に入った順に、基準の台以外へピッの高さを割り当てる（全員が同じ計算をするので、話し合わなくてもそろう）
  function countInFreq(id, refId) {
    const order = Object.entries(room.members)
      .filter(([mid, m]) => mid !== refId && typeof m.joinedAt === 'number')
      .sort(([idA, a], [idB, b]) => a.joinedAt - b.joinedAt || (idA < idB ? -1 : 1))
      .map(([mid]) => mid);
    const i = Math.max(0, order.indexOf(id));
    return COUNTIN_FREQS[i % COUNTIN_FREQS.length];
  }

  async function runCountIn(s) {
    const times = countInTimes(s.anchorAt);
    if (times[0] < room.serverNow() + 100) return; // 途中から入ったときなど、もう間に合わない
    const ctx = getAudioContext();
    ctx.resume();
    const refId = room.referenceId();
    const isRef = refId === settings.syncId;
    const freq = isRef ? CALIB_REF_HZ : countInFreq(settings.syncId, refId);
    times.forEach((t) => {
      const time = soundTimeOf(t);
      if (time > ctx.currentTime + 0.01) playCalibBeep(ctx, audioOutput(ctx), freq, time);
    });
    if (isRef || calibrating) return; // 基準の台は鳴らすだけ
    let capture = null;
    try {
      const stream = await ensureCountInMic();
      capture = startCalibCapture(stream);
      const stopAt = times[times.length - 1] + 400;
      await new Promise((r) => setTimeout(r, Math.max(0, stopAt - room.serverNow())));
      const samples = capture.stop();
      capture = null;
      const lag = measureCalibLag(samples, ctx.sampleRate, CALIB_REF_HZ, freq, 3);
      applyLag(lag, -400, 200);
      usage.track('countin');
      showCountInNote(`音で合わせました（${Math.round(Math.abs(lag))} ms ${lag > 0 ? '遅れ' : '早め'}を直しました）`, 'ok');
    } catch (e) {
      showCountInNote(e instanceof CalibError ? `音で合わせられませんでした：${e.message}` : 'マイクが使えなかったので、音で合わせられませんでした。', 'fail');
    } finally {
      if (capture) capture.stop();
    }
  }

  function showCountInNote(text, kind = '') {
    const box = $('syncCountInNote');
    box.textContent = text;
    box.className = `note small-note ${kind}`;
  }

  $('syncCountIn').addEventListener('change', async (e) => {
    const on = e.target.checked;
    if (on) {
      try {
        await ensureCountInMic(); // 押したときにマイクの許可を取っておく
      } catch (err) {
        e.target.checked = false;
        showCountInNote('マイクを使えませんでした。マイクの使用を許可してください。', 'fail');
        return;
      }
    } else {
      releaseCountInMic();
    }
    try {
      await room.setCountIn(on);
      showCountInNote(on ? 'オンにしました。次のスタートから、カウントインのピッで合わせます。' : '');
    } catch (err) {
      e.target.checked = !on;
      showCountInNote('切り替えられませんでした。Firebase のルールの更新が必要です（管理者向け）。', 'fail');
    }
  });

  $('syncCalib').addEventListener('click', () => autoCalibrate()); // (the click event must not be taken for a 'given' calibration)

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
