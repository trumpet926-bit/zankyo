// オンライン合奏（試作）：同じ部屋で「音声をつなぐ」を押した人どうしを、音声で直接つなぐ（WebRTC）
// 相手探しのやりとりは Firebase の部屋を使う。音そのものは端末どうしで直接送る

(function () {
  const LAB_KEY = 'practice-app-lab';
  // 入り口のパスワード（そのものは置かず、SHA-256 の値だけを置く）
  const PASSWORD_HASH = '6a55102bc62d2b162a1bceb975a1baeb460df43ade0ecf4e9ac28ebec89d1f0b';
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
  function unlocked() {
    try {
      return localStorage.getItem(LAB_KEY) === '1';
    } catch (e) {
      return false;
    }
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
    if ((await sha256($('labPassword').value.trim())) !== PASSWORD_HASH) {
      $('labError').hidden = false;
      return;
    }
    try {
      localStorage.setItem(LAB_KEY, '1');
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
    $('ensembleJoin').disabled = false;
    usage.track('ensemble');
    renderVoice();
  }

  function leaveVoice() {
    if (!sid) return;
    clearInterval(statsTimer);
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

  // 部屋を出たら、音声も切る
  syncHooks.onLeave = leaveVoice;
  syncHooks.voiceActive = () => !!sid;

  renderLab();
  renderVoice();
})();
