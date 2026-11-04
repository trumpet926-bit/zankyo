// オンライン合奏：同じ部屋で音声をつないだ人どうしを、音声で直接つなぐ（WebRTC）
// 相手探しのやりとりは Firebase の部屋を使う。音そのものは端末どうしで直接送る

(function () {
  // パスワードも合言葉もプログラムには置かない。入力されたパスワードから合言葉を作り、
  // Google Drive の受け取り口に問い合わせて正しければ、この端末に合言葉を覚えておく
  const LAB_KEY = 'practice-app-lab-key';
  const DRIVE_URL = 'https://script.google.com/macros/s/AKfycbyBRsbow4IEWd_5cUlqTn5QV6GqzOmiVE6MX3zUJQ7sWn3z1AoUiGW4zNcYd01yuFTznA/exec';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
  const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

  const room = syncHooks.room;
  let stream = null; // 自分のマイク
  let sid = null; // 今回つないだときの番号（つなぎ直したら変わる）
  let voiceRef = null;
  let inboxRef = null;
  let statsTimer = null;
  let voiceList = {}; // 音声をつないでいる人（部屋の番号 → { name, sid }）
  let selfMeter = null;
  let starting = false; // 「合奏をはじめる」「参加する」の途中
  const peers = {}; // 相手の端末の番号 → { pc, sid, name, audio, meter, pendingIce, state, latency }

  function randomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
  }

  function showText(id, text) {
    $(id).textContent = text || '';
    $(id).hidden = !text;
  }

  // ---------- パスワード ----------
  let driveKey = null;
  try {
    driveKey = localStorage.getItem(LAB_KEY);
    localStorage.removeItem('practice-app-lab'); // 前の版の印は使わない（パスワードを入れ直してもらう）
  } catch (e) {
    driveKey = null;
  }

  function unlocked() {
    return !!driveKey;
  }

  async function sha256(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  $('labUnlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = await sha256(`zankyo-drive:${$('labPassword').value.trim()}`);
    showText('labError', '');
    $('labSubmit').disabled = true;
    let ok = false;
    try {
      const res = await fetch(`${DRIVE_URL}?action=ping&key=${key}`);
      ok = (await res.json()).ok === true;
    } catch (err) {
      $('labSubmit').disabled = false;
      showText('labError', '確かめられませんでした。インターネットにつながっているか確認してください。');
      return;
    }
    $('labSubmit').disabled = false;
    if (!ok) {
      showText('labError', 'パスワードが違います。');
      return;
    }
    driveKey = key;
    try {
      localStorage.setItem(LAB_KEY, key);
    } catch (err) {
      // 保存できない開き方でも、今回は使えるようにする
    }
    $('labPassword').value = '';
    $('labPassword').blur();
    render();
    loadTakes();
  });

  $('labHide').addEventListener('click', () => {
    if (room.code) syncHooks.leaveRoom();
    leaveVoice();
    driveKey = null;
    try {
      localStorage.removeItem(LAB_KEY);
    } catch (e) {
      // 何もしない
    }
    render();
  });

  // ---------- 画面の切り替え（パスワード → 始める・参加する → 合奏中） ----------
  function render() {
    const open = unlocked();
    const inRoom = open && !!room.code;
    $('ensLock').hidden = open;
    $('ensLobby').hidden = !open || inRoom;
    $('ensSession').hidden = !inRoom;
    $('ensTakes').hidden = !open;
    $('labHide').hidden = !open || inRoom; // 合奏中は上の「退出」だけを出す
    $('bigCue').hidden = !inRoom;
    watchCue();
    if (inRoom) {
      $('ensRoomCode').textContent = room.code;
      $('ensConnect').hidden = !!sid || starting;
      renderMembers();
      renderControls();
    } else {
      $('ensQr').hidden = true;
    }
  }

  // ---------- 始める・参加する（部屋と音声を一度に） ----------
  async function startSession(code) {
    if (starting) return;
    showText('ensLobbyError', '');
    if (!window.RTCPeerConnection) {
      showText('ensLobbyError', 'このブラウザではオンライン合奏を使えません。');
      return;
    }
    starting = true;
    $('ensStartSession').disabled = true;
    $('ensJoinBtn').disabled = true;
    const label = code ? $('ensJoinBtn') : $('ensStartSession');
    const original = label.textContent;
    label.textContent = 'つないでいます…';
    getAudioContext().resume(); // 画面を触ったときでないと音を出せないため、ここで準備する
    if (settings.metroViaElement) applyMetroRoute();
    let mic = null;
    try {
      mic = await openMicrophone();
      const error = code ? await syncHooks.joinRoom(code) : await syncHooks.createRoom();
      if (error) throw new Error(error);
      await joinVoice(mic);
      mic = null;
    } catch (e) {
      if (mic) closeMicrophone(mic);
      showText('ensLobbyError', e.name === 'NotAllowedError' || e.name === 'NotFoundError'
        ? 'マイクを使えませんでした。マイクの使用を許可してください。'
        : e.message);
    } finally {
      starting = false;
      $('ensStartSession').disabled = false;
      $('ensJoinBtn').disabled = false;
      label.textContent = original;
      render();
    }
  }

  $('ensStartSession').addEventListener('click', () => startSession(null));
  $('ensJoinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('ensCode').blur();
    startSession($('ensCode').value.replace(/\D/g, ''));
  });

  // メトロノーム画面の「みんなで合わせる」から部屋に入っている人は、ここで音声だけつなぐ
  $('ensConnect').addEventListener('click', async () => {
    showText('ensError', '');
    getAudioContext().resume();
    if (settings.metroViaElement) applyMetroRoute();
    try {
      await joinVoice(await openMicrophone());
    } catch (e) {
      showText('ensError', 'マイクを使えませんでした。マイクの使用を許可してください。');
    }
    render();
  });

  $('ensLeave').addEventListener('click', () => {
    syncHooks.leaveRoom(); // 音声も切れる（syncHooks.onLeave）
    render();
  });

  // ---------- 招待 ----------
  function inviteUrl() {
    return `${location.origin}${location.pathname}?room=${room.code}&ensemble=1&openExternalBrowser=1`;
  }

  $('ensInvite').addEventListener('click', async () => {
    const box = $('ensQr');
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.innerHTML = '<p class="ens-small center">QRコードを準備しています…</p>';
    box.hidden = false;
    try {
      if (!window.qrcode) await loadScript(QR_LIB);
      const qr = qrcode(0, 'M');
      qr.addData(inviteUrl());
      qr.make();
      box.innerHTML = `<div class="ens-qr-image">${qr.createSvgTag(5, 2)}</div>` +
        '<p class="ens-small center">カメラで読み取ると、この合奏に参加できます（パスワードが必要です）。</p>';
    } catch (e) {
      box.innerHTML = '';
    }
    const share = document.createElement('button');
    share.className = 'ens-btn outline small';
    share.textContent = 'リンクを送る';
    share.addEventListener('click', async () => {
      const text = `残響 PracticeTool のオンライン合奏「${room.code}」に参加してください`;
      if (navigator.share) {
        navigator.share({ title: '残響 PracticeTool', text, url: inviteUrl() }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${inviteUrl()}`);
        share.textContent = 'リンクをコピーしました';
      } catch (e) {
        share.textContent = 'コピーできませんでした';
      }
    });
    box.appendChild(share);
  });

  // ---------- 音声をつなぐ ----------
  function send(toId, toSid, type, data) {
    room.roomRef.child(`signal/${toId}`).push({ from: room.memberId, sid, to: toSid, type, data: JSON.stringify(data) });
  }

  // 音を細かく区切って送る（遅れを減らす）。対応していない端末では無視される
  function tuneSdp(desc) {
    let sdp = desc.sdp.replace(/a=fmtp:(\d+) (.*useinbandfec=1.*)/g, (line, pt, params) =>
      `a=fmtp:${pt} ${params.replace(/;?minptime=\d+/, '')};minptime=10;maxaveragebitrate=96000`);
    if (!/a=ptime:/.test(sdp)) sdp = sdp.replace(/(m=audio.*\r\n)/, '$1a=ptime:10\r\n');
    return { type: desc.type, sdp };
  }

  // 音の大きさを測るもの（カードを光らせるため）
  function createMeter(mediaStream) {
    try {
      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      return { source, analyser, buf: new Float32Array(analyser.fftSize) };
    } catch (e) {
      return null;
    }
  }

  function closeMeter(meter) {
    if (meter) meter.source.disconnect();
  }

  function meterLevel(meter) {
    if (!meter) return 0;
    meter.analyser.getFloatTimeDomainData(meter.buf);
    return Math.max(0, (rmsToLevel(rmsOf(meter.buf)) - 0.35) / 0.65);
  }

  function createPeer(peerId, peerSid, name) {
    closePeer(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { pc, sid: peerSid, name, pendingIce: [], state: 'つないでいます…', latency: null, audio: new Audio(), meter: null };
    peer.audio.autoplay = true;
    peer.audio.playsInline = true;
    peers[peerId] = peer;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) send(peerId, peerSid, 'ice', e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      // 受け取った音をためておく時間を、できるだけ短くする
      try {
        e.receiver.jitterBufferTarget = 0;
      } catch (err) {
        // 対応していない端末
      }
      try {
        e.receiver.playoutDelayHint = 0;
      } catch (err) {
        // 対応していない端末
      }
      const remote = e.streams[0] || new MediaStream([e.track]);
      peer.audio.srcObject = remote;
      peer.audio.play().catch(() => {});
      closeMeter(peer.meter);
      peer.meter = createMeter(remote);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      peer.state = s === 'connected' ? 'つながりました' : s === 'failed' ? 'つながりません' : s === 'disconnected' ? '途切れています' : peer.state;
      renderMembers();
    };
    renderMembers();
    return peer;
  }

  function closePeer(peerId) {
    const peer = peers[peerId];
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    closeMeter(peer.meter);
    delete peers[peerId];
    renderMembers();
  }

  async function call(peerId, peerSid, name) {
    const peer = createPeer(peerId, peerSid, name);
    const offer = tuneSdp(await peer.pc.createOffer());
    await peer.pc.setLocalDescription(offer);
    send(peerId, peerSid, 'offer', offer);
  }

  async function addIce(peer, candidate) {
    if (!peer.pc.remoteDescription) {
      peer.pendingIce.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (e) {
      // 古い候補は無視する
    }
  }

  async function onSignal(msg) {
    if (!sid || msg.to !== sid) return; // 前につないだときの古い連絡は無視する
    const data = JSON.parse(msg.data);
    const name = (room.members[msg.from] && room.members[msg.from].name) || '';
    if (msg.type === 'offer') {
      const peer = createPeer(msg.from, msg.sid, name);
      await peer.pc.setRemoteDescription(data);
      const answer = tuneSdp(await peer.pc.createAnswer());
      await peer.pc.setLocalDescription(answer);
      send(msg.from, msg.sid, 'answer', answer);
      for (const c of peer.pendingIce.splice(0)) await addIce(peer, c);
      return;
    }
    const peer = peers[msg.from];
    if (!peer || peer.sid !== msg.sid) return;
    if (msg.type === 'answer') {
      await peer.pc.setRemoteDescription(data);
      for (const c of peer.pendingIce.splice(0)) await addIce(peer, c);
    } else if (msg.type === 'ice') {
      await addIce(peer, data);
    }
  }

  // 音声をつないでいる人の一覧が変わったとき
  function onVoiceMembers(list) {
    voiceList = list;
    Object.keys(peers).forEach((id) => {
      if (!list[id] || list[id].sid !== peers[id].sid) closePeer(id);
    });
    Object.entries(list).forEach(([id, v]) => {
      if (id === room.memberId || peers[id]) return;
      // 2人のうち、番号の小さい方から呼びかける（同時に呼びかけ合わないように）
      if (room.memberId < id) call(id, v.sid, v.name).catch(() => {});
    });
    renderMembers();
  }

  // mic：開いておいたマイク（画面を触った直後に開くため、呼ぶ側で用意する）
  async function joinVoice(mic) {
    stream = mic;
    sid = randomId();
    selfMeter = createMeter(stream);
    inboxRef = room.roomRef.child(`signal/${room.memberId}`);
    await inboxRef.remove().catch(() => {});
    inboxRef.onDisconnect().remove();
    inboxRef.on('child_added', (snap) => {
      const msg = snap.val();
      snap.ref.remove();
      onSignal(msg).catch(() => {});
    });
    voiceRef = room.roomRef.child('voice');
    voiceRef.child(room.memberId).onDisconnect().remove();
    await voiceRef.child(room.memberId).set({ name: room.name, sid });
    voiceRef.on('value', (snap) => onVoiceMembers(snap.val() || {}));
    statsTimer = setInterval(updateLatency, 2000);
    takeRef = room.roomRef.child('take');
    takeRef.on('value', (snap) => onTake(snap.val()));
    usage.track('ensemble');
    startMeters();
    render();
  }

  function leaveVoice() {
    if (!sid) return;
    clearInterval(statsTimer);
    if (takeRef) takeRef.off();
    takeRef = null;
    if (take) stopTake();
    Object.keys(peers).forEach(closePeer);
    if (voiceRef) {
      voiceRef.off();
      voiceRef.child(room.memberId).onDisconnect().cancel();
      voiceRef.child(room.memberId).remove().catch(() => {});
    }
    if (inboxRef) {
      inboxRef.off();
      inboxRef.onDisconnect().cancel();
      inboxRef.remove().catch(() => {});
    }
    voiceRef = null;
    inboxRef = null;
    voiceList = {};
    sid = null;
    closeMeter(selfMeter);
    selfMeter = null;
    if (stream) closeMicrophone(stream);
    stream = null;
    render();
  }

  // 相手の音が届くまでの遅れの目安：ネットの片道 ＋ 受け取った音をためている時間 ＋ 音を区切る時間
  async function updateLatency() {
    for (const peer of Object.values(peers)) {
      try {
        const report = await peer.pc.getStats();
        let rtt = null;
        let buffer = null;
        report.forEach((s) => {
          if (s.type === 'candidate-pair' && s.nominated && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime;
          if (s.type === 'inbound-rtp' && s.kind === 'audio' && s.jitterBufferEmittedCount) {
            const now = { delay: s.jitterBufferDelay, count: s.jitterBufferEmittedCount };
            if (peer.lastBuffer && now.count > peer.lastBuffer.count) {
              buffer = (now.delay - peer.lastBuffer.delay) / (now.count - peer.lastBuffer.count);
            }
            peer.lastBuffer = now;
          }
        });
        if (rtt != null) peer.latency = (rtt / 2) * 1000 + (buffer != null ? buffer * 1000 : 0) + 20; // 20 = 音を区切って送る時間
      } catch (e) {
        // 測れないときは前の値のまま
      }
    }
    renderMembers();
  }

  // ---------- 参加者のカード ----------
  function initialOf(name) {
    const chars = [...(name || '？')];
    return chars[0] === 'お' && chars.length > 1 ? chars[1] : chars[0];
  }

  function renderMembers() {
    if ($('ensSession').hidden) return;
    const box = $('ensMembers');
    const refId = room.referenceId();
    const ids = Object.keys(room.members);
    // 自分をいちばん前に
    ids.sort((a, b) => (a === room.memberId ? -1 : b === room.memberId ? 1 : 0));
    box.innerHTML = '';
    ids.forEach((id) => {
      const m = room.members[id];
      const me = id === room.memberId;
      const peer = peers[id];
      let state;
      let live = false;
      if (me) {
        state = sid ? (stream && !stream.getAudioTracks()[0].enabled ? 'マイク オフ' : 'あなた') : 'あなた（音声なし）';
        live = !!sid;
      } else if (peer) {
        live = peer.state === 'つながりました';
        state = live && peer.latency != null ? `${Math.round(peer.latency)} ms` : peer.state;
      } else if (voiceList[id]) {
        state = sid ? 'つないでいます…' : '音声あり';
      } else {
        state = '音声なし';
      }
      const card = document.createElement('div');
      card.className = `ens-member${me ? ' me' : ''}${live ? ' live' : ''}${!live && !voiceList[id] ? ' off' : ''}`;
      card.dataset.id = id;
      const avatar = document.createElement('div');
      avatar.className = 'ens-avatar';
      avatar.textContent = initialOf(m.name);
      if (id === refId) {
        const ref = document.createElement('span');
        ref.className = 'ens-ref';
        ref.textContent = '基準';
        avatar.appendChild(ref);
      }
      const name = document.createElement('div');
      name.className = 'ens-name';
      name.textContent = m.name;
      const info = document.createElement('div');
      info.className = 'ens-state';
      info.textContent = state;
      card.append(avatar, name, info);
      box.appendChild(card);
    });
  }

  // 吹いている人のカードを光らせる
  let meterFrame = null;
  function startMeters() {
    if (meterFrame) return;
    const tick = () => {
      if (!sid) {
        meterFrame = null;
        return;
      }
      if (!$('ensSession').hidden && document.visibilityState === 'visible') {
        $('ensMembers').querySelectorAll('.ens-member').forEach((card) => {
          const id = card.dataset.id;
          const meter = id === room.memberId ? selfMeter : peers[id] && peers[id].meter;
          card.style.setProperty('--level', meterLevel(meter).toFixed(2));
        });
      }
      meterFrame = requestAnimationFrame(tick);
    };
    meterFrame = requestAnimationFrame(tick);
  }

  // ---------- この画面のボタン ----------
  function renderControls() {
    const on = !!sid;
    const muted = on && stream && !stream.getAudioTracks()[0].enabled;
    $('ensMute').textContent = muted ? 'マイクを入れる' : 'マイクを切る';
    $('ensMute').disabled = !on;
    $('ensMute').classList.toggle('active', !!muted);
    renderTake();
  }

  $('ensMute').addEventListener('click', () => {
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    renderControls();
    renderMembers();
  });

  $('ensBpmDown').addEventListener('click', () => setBpm(settings.bpm - 1));
  $('ensBpmUp').addEventListener('click', () => setBpm(settings.bpm + 1));
  $('ensBeats').addEventListener('change', (e) => {
    $('beatsSelect').value = e.target.value;
    $('beatsSelect').dispatchEvent(new Event('change'));
  });
  $('ensStart').addEventListener('click', () => toggleMetronomeByUser());

  $('ensBig').addEventListener('click', () => $('openBigView').click());

  // ---------- 合図（次の小節で、全員の画面に 1・2・3・4 と拍の数字を出す） ----------
  let cueWatch = null; // { ref, code }
  let cueTimers = [];

  // 部屋に入っている間だけ、合図を受け取る
  function watchCue() {
    const code = unlocked() && room.code ? room.code : null;
    if (cueWatch && cueWatch.code === code) return;
    if (cueWatch) cueWatch.ref.off();
    cueWatch = null;
    if (!code) {
      hideCue();
      return;
    }
    const ref = room.roomRef.child('cue');
    ref.on('value', (snap) => showCue(snap.val()));
    cueWatch = { ref, code };
  }

  async function sendCue() {
    if (!room.code) return;
    getAudioContext().resume(); // 画面を触ったときでないと音を出せないため、ここで準備する
    let s = room.state;
    if (!s || !s.running) {
      const result = await room.toggleRunning(); // 止まっていたら、全員のメトロノームを動かしてから数える
      s = result.snapshot.val();
    }
    const barMs = (60000 / s.bpm) * s.beats;
    const after = room.serverNow() + 700; // 全員に届く余裕を見る
    const at = s.anchorAt + Math.max(0, Math.ceil((after - s.anchorAt) / barMs)) * barMs;
    room.roomRef.child('cue').set({ at, beats: s.beats, bpm: s.bpm, by: room.name });
  }

  function hideCue() {
    cueTimers.forEach(clearTimeout);
    cueTimers = [];
    $('cueView').hidden = true;
  }

  function showCueBeat(n, beats) {
    const num = $('cueNum');
    num.textContent = n;
    num.classList.toggle('first', n === 1);
    num.classList.remove('pop');
    void num.offsetWidth; // 拍ごとに動きをはじめから
    num.classList.add('pop');
    $('cueDots').querySelectorAll('span').forEach((dot, i) => dot.classList.toggle('on', i < n));
    if (n === beats) num.classList.add('last');
  }

  function showCue(c) {
    hideCue();
    if (!c) return;
    const beatMs = 60000 / c.bpm;
    // 自分のメトロノームの音（タイミング補正の分も）と同じ瞬間に数字を出す
    const now = room.serverNow() - settings.syncOffsetMs;
    if (c.at + c.beats * beatMs < now) return; // 終わった合図
    $('cueBy').textContent = `${c.by}さんの合図`;
    $('cueNum').textContent = '';
    $('cueNum').className = 'cue-num';
    $('cueDots').innerHTML = '<span></span>'.repeat(c.beats);
    $('cueView').hidden = false;
    for (let i = 0; i < c.beats; i++) {
      cueTimers.push(setTimeout(() => showCueBeat(i + 1, c.beats), Math.max(0, c.at + i * beatMs - now)));
    }
    cueTimers.push(setTimeout(hideCue, Math.max(0, c.at + c.beats * beatMs - now))); // 次の小節の頭（吹き始め）で消す
  }

  $('ensCue').addEventListener('click', sendCue);
  $('bigCue').addEventListener('click', sendCue);
  $('cueView').addEventListener('click', hideCue);

  // ---------- 合奏録音 ----------
  // 各自が自分の音だけを録り、Google Drive（受け取り口）に集めて、部屋の時刻でそろえて重ねる。
  // 録音の頭に、部屋の時刻が分かっている短い音（目印）を録音の中だけに入れておき、重ねるときはそれを手がかりにそろえる
  const MARKER_HZ = 3000;
  let takeRef = null;
  let take = null; // 今録音している回
  let takeStatus = '';
  let takeTimer = null;
  let failedUpload = null; // 送れなかった録音（もう一度送るため）
  const handledTakes = new Set();

  // AudioContext の時刻を、部屋の時刻（ミリ秒）に直す（sync-ui の toCtxTime の逆）
  function ctxToServerMs(ctxTime) {
    const ctx = getAudioContext();
    return room.serverNow() - settings.syncOffsetMs + (ctxTime - ctx.currentTime) * 1000;
  }

  function newTakeId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${randomId().slice(0, 4)}`;
  }

  function takeLabel(id) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(id);
    return m ? `${Number(m[2])}月${Number(m[3])}日 ${m[4]}:${m[5]}` : id;
  }

  // 誰かが録音を始めたら、メトロノームの次の小節（少し余裕を見て）から全員で録る
  function startTakeByUser() {
    const s = room.state;
    const now = room.serverNow();
    let startAt = now + 1500;
    if (s && s.running) {
      const barMs = (60000 / s.bpm) * s.beats;
      startAt = s.anchorAt + Math.max(0, Math.ceil((now + 1500 - s.anchorAt) / barMs)) * barMs;
    }
    room.roomRef.child('take').set({ id: newTakeId(), by: room.name, startAt, recording: true, at: now });
  }

  function stopTakeByUser() {
    room.roomRef.child('take').update({ recording: false, at: room.serverNow() });
  }

  function onTake(t) {
    const fresh = !!t && t.recording && room.serverNow() - t.at < 30 * 60 * 1000;
    if (take && (!fresh || t.id !== take.id)) stopTake();
    if (fresh && !take && !handledTakes.has(t.id)) startTake(t);
    renderTake();
  }

  function startTake(t) {
    handledTakes.add(t.id);
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start(1000);
    const markerAt = ctx.currentTime + 0.4;
    playCalibBeep(ctx, dest, MARKER_HZ, markerAt); // 録音の中だけに入る目印（スピーカーには出さない）
    take = { id: t.id, by: t.by, rec, chunks, source, mime: rec.mimeType || mime, markerServerMs: ctxToServerMs(markerAt), startAt: t.startAt };
    takeStatus = '';
    takeTimer = setInterval(renderTake, 500);
    usage.track('take');
  }

  async function stopTake() {
    const current = take;
    take = null;
    clearInterval(takeTimer);
    renderTake();
    await new Promise((resolve) => {
      current.rec.onstop = resolve;
      current.rec.stop();
    });
    current.source.disconnect();
    const blob = new Blob(current.chunks, { type: (current.mime || 'audio/webm').split(';')[0] });
    await upload(current, blob);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function upload(current, blob) {
    takeStatus = '録音を Google Drive に送っています…';
    renderTake();
    try {
      const res = await fetch(DRIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // 余計な事前確認をさせないため
        body: JSON.stringify({
          key: driveKey,
          take: current.id,
          fileName: `${room.name || '録音'}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`,
          mime: blob.type,
          data: await blobToBase64(blob),
          meta: { name: room.name, member: room.memberId, markerServerMs: current.markerServerMs, startAt: current.startAt },
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error);
      failedUpload = null;
      takeStatus = '録音を送りました。全員が送り終わったら、下の「これまでの合奏録音」から重ねて聞けます。';
      setTimeout(loadTakes, 1500);
    } catch (e) {
      failedUpload = { current, blob };
      takeStatus = '録音を送れませんでした。インターネットにつながっているか確認して、「もう一度送る」を押してください。';
    }
    renderTake();
  }

  function renderTake() {
    const recording = !!take;
    $('ensRec').classList.toggle('recording', recording);
    $('ensRec').disabled = !sid && !recording;
    let label = sid ? '合奏を録音する' : '音声をつなぐと録音できます';
    if (recording) {
      const sec = Math.max(0, Math.floor((room.serverNow() - take.startAt) / 1000));
      label = room.serverNow() < take.startAt
        ? `次の小節から録音します（${take.by}さん）`
        : `録音中 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} ・ タップで全員止める`;
    }
    $('ensRecLabel').textContent = label;
    showText('ensTakeStatus', recording ? '' : takeStatus);
    $('ensTakeRetry').hidden = !failedUpload || recording;
  }

  $('ensRec').addEventListener('click', () => (take ? stopTakeByUser() : startTakeByUser()));
  $('ensTakeRetry').addEventListener('click', () => {
    if (failedUpload) upload(failedUpload.current, failedUpload.blob);
  });

  // ---------- これまでの合奏録音と、重ねて聞く ----------
  async function driveGet(params) {
    const query = new URLSearchParams({ ...params, key: driveKey });
    const res = await fetch(`${DRIVE_URL}?${query}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  function showMixStatus(text, kind = '') {
    showText('mixStatus', text);
    $('mixStatus').className = `ens-small ${kind}`;
  }

  let takesLoading = false;
  async function loadTakes() {
    if (!unlocked() || takesLoading) return;
    takesLoading = true;
    const box = $('ensTakeList');
    if (!box.childElementCount) box.innerHTML = '<p class="ens-small">読み込んでいます…</p>';
    try {
      const { takes } = await driveGet({ action: 'takes' });
      const list = takes.filter(({ take: id }, i) => /^\d{8}-\d{4}-/.test(id) && takes.findIndex((t) => t.take === id) === i);
      box.innerHTML = list.length ? '' : '<p class="ens-small">まだ合奏録音はありません。</p>';
      list.slice(0, 8).forEach(({ take: id }) => {
        const row = document.createElement('div');
        row.className = 'ens-take';
        const label = document.createElement('span');
        label.textContent = takeLabel(id);
        const btn = document.createElement('button');
        btn.className = 'ens-btn outline small';
        btn.textContent = '重ねて聞く';
        btn.addEventListener('click', () => mixTake(id, btn));
        row.append(label, btn);
        box.appendChild(row);
      });
    } catch (e) {
      box.innerHTML = '<p class="ens-small">Google Drive につながりませんでした。</p>';
    }
    takesLoading = false;
  }

  function base64ToArrayBuffer(data) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // 録音の頭の目印の位置（秒）
  function findMarker(buffer) {
    const sr = buffer.sampleRate;
    const x = buffer.getChannelData(0).subarray(0, Math.min(buffer.length, sr * 4));
    const env = calibBandEnvelope(x, sr, MARKER_HZ);
    const max = env.reduce((a, b) => Math.max(a, b), 0);
    if (!max) return null;
    const first = env.findIndex((v) => v >= max * 0.5);
    let peak = first;
    const end = Math.min(env.length, first + Math.round((60 * sr) / CALIB_HOP / 1000));
    for (let j = first; j < end; j++) if (env[j] > env[peak]) peak = j;
    return (calibOnsetBefore(env, peak, Math.max(0, first - 20)) * CALIB_HOP) / sr;
  }

  // 16bit の WAV ファイルにする
  function encodeWav(buffer) {
    const data = buffer.getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + data.length * 2));
    const text = (pos, s) => [...s].forEach((c, i) => out.setUint8(pos + i, c.charCodeAt(0)));
    text(0, 'RIFF');
    out.setUint32(4, 36 + data.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, buffer.sampleRate, true);
    out.setUint32(28, buffer.sampleRate * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    text(36, 'data');
    out.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
    return new Blob([out], { type: 'audio/wav' });
  }

  let mixing = false;
  async function mixTake(id, button) {
    if (mixing) return;
    mixing = true;
    button.disabled = true;
    try {
      showMixStatus('録音を集めています…');
      const { files } = await driveGet({ action: 'list', take: id });
      const ctx = getAudioContext();
      const tracks = [];
      const skipped = [];
      for (const [i, f] of files.entries()) {
        showMixStatus(`録音を集めています…（${i + 1}／${files.length}）`);
        const { data } = await driveGet({ action: 'get', id: f.id });
        const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(data));
        const markerSec = findMarker(buffer);
        if (markerSec == null || typeof f.meta.markerServerMs !== 'number') {
          skipped.push(f.meta.name || f.name);
          continue;
        }
        tracks.push({ buffer, markerSec, markerServerMs: f.meta.markerServerMs, startAt: f.meta.startAt });
      }
      if (!tracks.length) throw new Error('none');

      // 録音の中の位置 x（秒）と部屋の時刻の関係：部屋の時刻 = 目印の部屋の時刻 + (x − 目印の位置)
      // 重ねた録音の 0 秒を、録音を始めた小節の頭にする
      showMixStatus('時刻をそろえて重ねています…');
      const origin = tracks[0].startAt;
      const sr = ctx.sampleRate;
      let length = 0;
      tracks.forEach((t) => {
        t.shift = t.markerSec + (origin - t.markerServerMs) / 1000; // 重ねた録音の 0 秒にあたる、この録音の位置
        t.skip = Math.max(t.shift, t.markerSec + 0.15); // 目印は入れない
        length = Math.max(length, t.buffer.duration - t.shift);
      });
      if (length <= 0) throw new Error('empty');
      const off = new OfflineAudioContext(1, Math.ceil(length * sr), sr);
      tracks.forEach((t) => {
        if (t.skip >= t.buffer.duration) return;
        const src = off.createBufferSource();
        src.buffer = t.buffer;
        src.connect(off.destination);
        src.start(t.skip - t.shift, t.skip);
      });
      const mixed = await off.startRendering();
      // 音割れしないよう、いちばん大きいところを 0.9 にそろえる
      const ch = mixed.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
      if (peak > 0) {
        const gain = Math.min(4, 0.9 / peak);
        for (let i = 0; i < ch.length; i++) ch[i] *= gain;
      }
      showMixStatus(`${tracks.length}人分を重ねて、録音の一覧に入れました。${skipped.length ? `（${skipped.join('、')}さんの録音はそろえられなかったので除きました）` : ''}`, 'ok');
      await addRecordingFromBlob(encodeWav(mixed), `合奏 ${takeLabel(id)}（${tracks.length}人）`);
    } catch (e) {
      showMixStatus('重ねられませんでした。全員の録音が送り終わっているか確認して、もう一度お試しください。', 'fail');
    }
    button.disabled = false;
    mixing = false;
  }

  // ---------- メトロノームの音の出口 ----------
  function applyMetroRoute() {
    setElementRoute(settings.metroViaElement);
    metronome.reroute();
  }
  $('metroViaElement').checked = settings.metroViaElement;
  $('metroViaElement').addEventListener('change', (e) => {
    getAudioContext().resume();
    settings.metroViaElement = e.target.checked;
    saveSettings(settings);
    applyMetroRoute();
  });

  // ---------- 部屋の変化 ----------
  syncHooks.onLeave = leaveVoice; // 部屋を出たら、音声も切る
  syncHooks.onRoomChange = render;
  syncHooks.onMembers = renderMembers;
  syncHooks.voiceActive = () => !!sid;

  // この画面を開いたら、合奏録音の一覧を新しくする
  document.querySelector('.tab[data-panel="ensemble"]').addEventListener('click', loadTakes);

  // 合奏の招待リンクから開いたときは、この画面を出して部屋の番号を入れておく
  const params = new URLSearchParams(location.search);
  const invited = params.get('room');
  if (params.get('ensemble') === '1' && invited && /^\d{6}$/.test(invited)) {
    $('ensCode').value = invited;
    $('ensLobbyLead').textContent = `部屋「${invited}」に招待されています。有線イヤホンをつけて「参加する」を押してください。`;
    showPanel('ensemble');
  }

  render();
  if (unlocked() && !$('panel-ensemble').classList.contains('active')) return;
  loadTakes();
})();
