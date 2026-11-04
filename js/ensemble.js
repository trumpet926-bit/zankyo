// オンライン合奏（試作）：同じ部屋で「音声をつなぐ」を押した人どうしを、音声で直接つなぐ（WebRTC）
// 相手探しのやりとりは Firebase の部屋を使う。音そのものは端末どうしで直接送る

(function () {
  // パスワードも合言葉もプログラムには置かない。入力されたパスワードから合言葉を作り、
  // Google Drive の受け取り口に問い合わせて正しければ、この端末に合言葉を覚えておく
  const LAB_KEY = 'practice-app-lab-key';
  const DRIVE_URL = 'https://script.google.com/macros/s/AKfycbyBRsbow4IEWd_5cUlqTn5QV6GqzOmiVE6MX3zUJQ7sWn3z1AoUiGW4zNcYd01yuFTznA/exec';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  const room = syncHooks.room;
  let stream = null; // 自分のマイク
  let sid = null; // 今回つないだときの番号（つなぎ直したら変わる）
  let voiceRef = null;
  let inboxRef = null;
  let statsTimer = null;
  const peers = {}; // 相手の端末の番号 → { pc, sid, name, audio, pendingIce, state, latency }

  function randomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
  }

  // ---------- 隠れた入り口とパスワード ----------
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

  function renderLab() {
    $('ensembleCard').hidden = !unlocked();
  }

  async function sha256(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 「みんなで合わせる」の見出しを 3 秒以内に 5 回たたくと、パスワードの入力欄が出る
  let taps = [];
  $('syncHeading').addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 3000).concat(now);
    if (taps.length < 5 || unlocked()) return;
    taps = [];
    $('labUnlock').hidden = false;
    $('labPassword').value = '';
    $('labPassword').focus();
  });

  $('labUnlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = await sha256(`zankyo-drive:${$('labPassword').value.trim()}`);
    $('labError').hidden = true;
    let ok = false;
    try {
      const res = await fetch(`${DRIVE_URL}?action=ping&key=${key}`);
      ok = (await res.json()).ok === true;
    } catch (err) {
      $('labError').textContent = '確かめられませんでした。インターネットにつながっているか確認してください。';
      $('labError').hidden = false;
      return;
    }
    if (!ok) {
      $('labError').textContent = 'パスワードが違います。';
      $('labError').hidden = false;
      return;
    }
    driveKey = key;
    try {
      localStorage.setItem(LAB_KEY, key);
    } catch (err) {
      // 保存できない開き方でも、今回は使えるようにする
    }
    $('labPassword').blur();
    $('labUnlock').hidden = true;
    $('labError').hidden = true;
    $('ensembleCard').hidden = false;
  });

  $('labCancel').addEventListener('click', () => {
    $('labPassword').blur();
    $('labUnlock').hidden = true;
    $('labError').hidden = true;
  });

  $('labHide').addEventListener('click', () => {
    leaveVoice();
    driveKey = null;
    try {
      localStorage.removeItem(LAB_KEY);
    } catch (e) {
      // 何もしない
    }
    renderLab();
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

  function createPeer(peerId, peerSid, name) {
    closePeer(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { pc, sid: peerSid, name, pendingIce: [], state: 'つないでいます…', latency: null, audio: new Audio() };
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
      peer.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      peer.audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      peer.state = s === 'connected' ? 'つながりました' : s === 'failed' ? 'つながりません' : s === 'disconnected' ? '途切れています' : peer.state;
      renderPeers();
    };
    renderPeers();
    return peer;
  }

  function closePeer(peerId) {
    const peer = peers[peerId];
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    delete peers[peerId];
    renderPeers();
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
    Object.keys(peers).forEach((id) => {
      if (!list[id] || list[id].sid !== peers[id].sid) closePeer(id);
    });
    Object.entries(list).forEach(([id, v]) => {
      if (id === room.memberId || peers[id]) return;
      // 2人のうち、番号の小さい方から呼びかける（同時に呼びかけ合わないように）
      if (room.memberId < id) call(id, v.sid, v.name).catch(() => {});
    });
  }

  async function joinVoice() {
    $('ensembleError').hidden = true;
    if (!window.RTCPeerConnection) {
      showError('このブラウザでは使えません。');
      return;
    }
    $('ensembleJoin').disabled = true;
    getAudioContext().resume();
    if (settings.metroViaElement) applyMetroRoute(); // 画面を触ったときでないと鳴らせないため、ここで用意する
    try {
      stream = await openMicrophone();
    } catch (e) {
      $('ensembleJoin').disabled = false;
      showError('マイクを使えませんでした。マイクの使用を許可してください。');
      return;
    }
    sid = randomId();
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
    $('ensembleJoin').disabled = false;
    usage.track('ensemble');
    renderVoice();
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
    sid = null;
    if (stream) closeMicrophone(stream);
    stream = null;
    renderVoice();
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
        if (rtt != null) {
          peer.latency = { net: (rtt / 2) * 1000, buffer: buffer != null ? buffer * 1000 : null };
        }
      } catch (e) {
        // 測れないときは前の値のまま
      }
    }
    renderPeers();
  }

  // ---------- 表示 ----------
  function showError(text) {
    $('ensembleError').textContent = text;
    $('ensembleError').hidden = false;
  }

  function renderVoice() {
    const on = !!sid;
    $('ensembleJoin').textContent = on ? '音声を切る' : '音声をつなぐ';
    $('ensembleJoin').className = on ? 'btn danger full-width' : 'btn primary full-width';
    $('ensembleMute').hidden = !on;
    $('ensembleMute').textContent = '自分のマイクを切る';
    renderPeers();
    renderTake();
  }

  function renderPeers() {
    const box = $('ensemblePeers');
    if (!sid) {
      box.innerHTML = '';
      return;
    }
    const list = Object.values(peers);
    if (!list.length) {
      box.innerHTML = '<p class="note">ほかの人が「音声をつなぐ」を押すのを待っています…</p>';
      return;
    }
    box.innerHTML = '';
    list.forEach((peer) => {
      const row = document.createElement('div');
      row.className = 'ensemble-peer';
      let detail = peer.state;
      if (peer.latency && peer.state === 'つながりました') {
        const { net, buffer } = peer.latency;
        const total = net + (buffer || 0) + 20; // 20 = 音を区切って送る時間の目安
        detail = `通信の遅れ 約${Math.round(total)} ms（ネット ${Math.round(net)}${buffer != null ? ` ／ 受信待ち ${Math.round(buffer)}` : ''}）`;
      }
      const name = document.createElement('b');
      name.textContent = peer.name || '（名前なし）';
      const info = document.createElement('span');
      info.className = 'note';
      info.textContent = detail;
      row.append(name, info);
      box.appendChild(row);
    });
  }

  $('ensembleJoin').addEventListener('click', () => (sid ? leaveVoice() : joinVoice()));
  $('ensembleMute').addEventListener('click', () => {
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    $('ensembleMute').textContent = track.enabled ? '自分のマイクを切る' : '自分のマイクを入れる';
  });

  // ---------- 合奏録音 ----------
  // 各自が自分の音だけを録り、Google Drive（受け取り口）に集めて、部屋の時刻でそろえて重ねる。
  // 録音の頭に、部屋の時刻が分かっている短い音（目印）を録音の中だけに入れておき、重ねるときはそれを手がかりにそろえる
  const MARKER_HZ = 3000;
  let takeRef = null;
  let take = null; // 今録音している回
  let takeStatus = '';
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
    return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : id;
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
    take = { id: t.id, rec, chunks, source, mime: rec.mimeType || mime, markerServerMs: ctxToServerMs(markerAt), startAt: t.startAt };
    takeStatus = `● 録音中（${t.by}さんが開始）`;
    usage.track('take');
  }

  async function stopTake() {
    const current = take;
    take = null;
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
      takeStatus = `録音を送りました（${takeLabel(current.id)}）。全員が送り終わったら「録音を重ねて聞く」を押してください。`;
    } catch (e) {
      failedUpload = { current, blob };
      takeStatus = '録音を送れませんでした。インターネットにつながっているか確認して、「もう一度送る」を押してください。';
    }
    renderTake();
  }

  function renderTake() {
    const recording = !!take;
    $('ensembleTake').hidden = !sid && !takeStatus;
    $('takeToggle').hidden = !sid;
    $('takeToggle').textContent = recording ? '■ 録音を止める（全員）' : '● 合奏を録音する（全員）';
    $('takeToggle').className = recording ? 'btn danger full-width' : 'btn full-width';
    $('takeStatus').textContent = takeStatus;
    $('takeStatus').hidden = !takeStatus;
    $('takeRetry').hidden = !failedUpload;
  }

  $('takeToggle').addEventListener('click', () => (take ? stopTakeByUser() : startTakeByUser()));
  $('takeRetry').addEventListener('click', () => {
    if (failedUpload) upload(failedUpload.current, failedUpload.blob);
  });

  // ---------- 録音を重ねる ----------
  async function driveGet(params) {
    const query = new URLSearchParams({ ...params, key: driveKey });
    const res = await fetch(`${DRIVE_URL}?${query}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  function showMixStatus(text, kind = '') {
    $('mixStatus').textContent = text;
    $('mixStatus').className = `note ${kind}`;
    $('mixStatus').hidden = !text;
  }

  $('mixOpen').addEventListener('click', async () => {
    const box = $('mixList');
    if (box.childElementCount) {
      box.innerHTML = '';
      showMixStatus('');
      return;
    }
    showMixStatus('Google Drive の録音を調べています…');
    try {
      const { takes } = await driveGet({ action: 'takes' });
      const list = takes.filter(({ take: id }, i) => /^\d{8}-\d{4}-/.test(id) && takes.findIndex((t) => t.take === id) === i);
      showMixStatus(list.length ? '重ねたい回を選んでください。' : 'まだ合奏録音はありません。');
      list.slice(0, 8).forEach(({ take: id }) => {
        const btn = document.createElement('button');
        btn.className = 'btn small';
        btn.textContent = takeLabel(id);
        btn.addEventListener('click', () => mixTake(id));
        box.appendChild(btn);
      });
    } catch (e) {
      showMixStatus('Google Drive につながりませんでした。', 'fail');
    }
  });

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

  async function mixTake(id) {
    $('mixList').innerHTML = '';
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
      await addRecordingFromBlob(encodeWav(mixed), `合奏 ${takeLabel(id)}（${tracks.length}人）`);
      showMixStatus(`${tracks.length}人分を重ねて、録音の一覧に入れました。${skipped.length ? `（${skipped.join('、')}さんの録音はそろえられなかったので除きました）` : ''}`, 'ok');
    } catch (e) {
      showMixStatus('重ねられませんでした。全員の録音が送り終わっているか確認して、もう一度お試しください。', 'fail');
    }
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

  // 部屋を出たら、音声も切る
  syncHooks.onLeave = leaveVoice;
  syncHooks.voiceActive = () => !!sid;

  renderLab();
  renderVoice();
})();
