// 音を鳴らす共通部分（メトロノームと音階で同じものを使う）

let sharedAudioContext = null;
let referencePitch = 442; // 基準のA（ラ）の周波数。チューナーの設定と共通

function setReferencePitch(hz) {
  referencePitch = hz;
}

// iPhone・iPad（Safari 17以降）での音の扱い方を切り替える
// 普段は消音スイッチがオンでも鳴る「再生専用」。マイクを使うあいだは、まず「おまかせ」にする
// （「再生と録音」とはっきり伝えると、iPad などが通話のように音を小さく抑えることがあるため）
let micSessionType = 'auto';

function setAudioSessionForMic(useMic) {
  if (navigator.audioSession) {
    navigator.audioSession.type = useMic ? micSessionType : 'playback';
  }
}

// 使うマイク（'' = おまかせ）。外付けのレコーダーやUSBマイクを選べる
let preferredMicId = '';
function setPreferredMic(id) {
  preferredMicId = id || '';
}

function requestMicrophone({ simple = false, deviceId = preferredMicId } = {}) {
  // 楽器の音をそのまま拾うため、通話用の自動補正は切る（simple のときはブラウザにまかせる）
  const audio = simple ? {} : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ audio: Object.keys(audio).length ? audio : true });
}

// Android で外付けのレコーダー（ZOOM H4n Pro など）をつなぐと、細かい指定のままでは開けないことがある。
// そのときは指定をゆるめたり、ほかのマイクを順に試したりする（許可されていないときは試さない）
async function requestMicrophoneSafely() {
  try {
    return await requestMicrophone();
  } catch (first) {
    if (first.name === 'NotAllowedError' || first.name === 'SecurityError') throw first;
    const tries = [{ simple: true }];
    if (preferredMicId) tries.push({ deviceId: '' }, { simple: true, deviceId: '' });
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== preferredMicId)
        .forEach((d) => tries.push({ simple: true, deviceId: d.deviceId }));
    } catch (e) { /* 一覧がとれなくても、ゆるめた指定は試す */ }
    for (const t of tries) {
      try {
        return await requestMicrophone(t);
      } catch (e) { /* 次を試す */ }
    }
    throw first;
  }
}

// 選べるマイクの一覧（名前はマイクを一度許可したあとでないと出ない）
async function listMicrophones() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
}

// 今使っているマイクの数（オンライン合奏とタイミング調整など、同時に使うことがある）
let openMics = 0;

// マイクを使い始める（失敗したら音の扱い方を元に戻す）
async function openMicrophone() {
  setAudioSessionForMic(true);
  let stream;
  try {
    stream = await requestMicrophoneSafely();
  } catch (e) {
    // 「おまかせ」でマイクを使えなかったときは、以前の「再生と録音」に切り替えてもう一度試す
    if (navigator.audioSession && micSessionType === 'auto' && e.name !== 'NotAllowedError') {
      micSessionType = 'play-and-record';
      setAudioSessionForMic(true);
      try {
        stream = await requestMicrophoneSafely();
      } catch (retryError) {
        if (!openMics) setAudioSessionForMic(false);
        throw retryError;
      }
    } else {
      if (!openMics) setAudioSessionForMic(false);
      throw e;
    }
  }
  openMics++;
  return stream;
}

// 波形データの音の大きさ（RMS）
function rmsOf(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

// 音の大きさをメーター用の 0〜1 にする（-60dB〜0dB）
function rmsToLevel(rms) {
  return Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-9) + 60) / 60));
}

function closeMicrophone(stream) {
  stream.getTracks().forEach((track) => track.stop());
  openMics = Math.max(0, openMics - 1);
  if (!openMics) setAudioSessionForMic(false); // ほかでまだマイクを使っているときは、音の扱い方を変えない
}

// メトロノームの音の出口。ふつうはそのままスピーカーへ出す。
// オンライン合奏中にメトロノームだけ聞こえないパソコンがあったため、相手の声と同じ <audio> の部品を通して鳴らすこともできる
let elementRoute = null;

function audioOutput(ctx) {
  return elementRoute ? elementRoute.node : ctx.destination;
}

function setElementRoute(on) {
  if (on && !elementRoute) {
    const node = getAudioContext().createMediaStreamDestination();
    const audio = useSpeakerFor(new Audio());
    audio.srcObject = node.stream;
    audio.play().catch(() => {});
    elementRoute = { node, audio };
  } else if (on) {
    elementRoute.audio.play().catch(() => {});
  } else if (!on && elementRoute) {
    elementRoute.audio.srcObject = null;
    elementRoute = null;
  }
}

function getAudioContext() {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    applySpeaker(sharedAudioContext);
  }
  return sharedAudioContext;
}

// 音を出す場所（'' = おまかせ）。マイクだけ外付けのレコーダーにして、音は本体や Bluetooth のスピーカーから出す。
// 選べるのは、ブラウザが「音の出口を選ぶ」機能（setSinkId）を持っているときだけ（パソコンの Chrome・Edge など）
const canPickSpeaker = (window.AudioContext && 'setSinkId' in AudioContext.prototype) ||
  (window.HTMLMediaElement && 'setSinkId' in HTMLMediaElement.prototype);
let preferredSpeakerId = '';
const speakerTargets = new Set();

function applySpeaker(target) {
  if (target && typeof target.setSinkId === 'function') {
    target.setSinkId(preferredSpeakerId || '').catch(() => {});
  }
}

// <audio> の部品も、選んだ出口から鳴らす
function useSpeakerFor(el) {
  speakerTargets.add(el);
  applySpeaker(el);
  return el;
}

function setPreferredSpeaker(id) {
  preferredSpeakerId = id || '';
  if (sharedAudioContext) applySpeaker(sharedAudioContext);
  speakerTargets.forEach(applySpeaker);
}

async function listSpeakers() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
}

// メトロノームの音色。iPhone の小さなスピーカーでも聞こえやすいよう、倍音（硬さ）の多い音を用意する
const CLICK_SOUNDS = [
  { id: 'wood', name: 'ウッドブロック' },
  { id: 'beep', name: '電子音' },
  { id: 'cowbell', name: 'カウベル' },
  { id: 'click', name: 'クリック' },
];
let clickSound = 'wood';

function setClickSound(id) {
  clickSound = CLICK_SOUNDS.some((s) => s.id === id) ? id : 'wood';
}

// 短い「音のかたまり」を1つ鳴らす（波の形・高さ・大きさ・長さ）
function clickTone(ctx, destination, time, { type = 'sine', freq, amp, dur, filter = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(amp, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q || 1;
    node = node.connect(f);
  }
  node.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

// ほんの一瞬の「ザッ」という音（木を叩いた感じを出す）
let clickNoise = null;
function clickNoiseBurst(ctx, destination, time, freq, amp) {
  if (!clickNoise || clickNoise.sampleRate !== ctx.sampleRate) {
    clickNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const data = clickNoise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = clickNoise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  src.connect(f).connect(gain).connect(destination);
  src.start(time);
}

// strong：1拍目（強め・高め）。sub：拍の中の細かい刻み（弱め・低め）
function playClickSound(ctx, destination, time, strong, sub) {
  const level = sub ? 0.45 : strong ? 1 : 0.8;
  if (clickSound === 'wood') {
    const f = sub ? 760 : strong ? 1250 : 950;
    clickTone(ctx, destination, time, { type: 'triangle', freq: f, amp: 0.8 * level, dur: 0.08 });
    clickTone(ctx, destination, time, { type: 'sine', freq: f * 2.7, amp: 0.35 * level, dur: 0.035 });
    clickNoiseBurst(ctx, destination, time, f * 2, 0.4 * level);
  } else if (clickSound === 'beep') {
    const f = sub ? 1100 : strong ? 1760 : 1320;
    clickTone(ctx, destination, time, { type: 'square', freq: f, amp: 0.7 * level, dur: sub ? 0.035 : 0.06, filter: { type: 'lowpass', freq: 7000 } });
  } else if (clickSound === 'cowbell') {
    // 2つの四角い波を重ねて、金属の「カン」にする
    const base = sub ? 0.8 : strong ? 1.15 : 1;
    [540, 800].forEach((f) => clickTone(ctx, destination, time, {
      type: 'square', freq: f * base, amp: 0.5 * level, dur: sub ? 0.12 : 0.28, filter: { type: 'bandpass', freq: 900 * base, q: 1.2 },
    }));
  } else {
    // クリック（もとの音）
    clickTone(ctx, destination, time, { freq: sub ? 700 : strong ? 1600 : 1000, amp: sub ? 0.35 : strong ? 1 : 0.6, dur: sub ? 0.04 : 0.05 });
  }
}

function playClick(ctx, destination, time, strong) {
  playClickSound(ctx, destination, time, strong, false);
}

// 拍の中の細かい刻みの音（拍の音より低く小さい）
function playSubClick(ctx, destination, time) {
  playClickSound(ctx, destination, time, false, true);
}

// 音程のある音（金管っぽい少し明るい音）
function playTone(ctx, destination, midi, time, duration) {
  const freq = referencePitch * Math.pow(2, (midi - 69) / 12);
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 5, 8000);
  const release = Math.min(0.05, duration / 3);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.35, time + 0.02);
  gain.gain.setValueAtTime(0.35, time + duration - release);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}
