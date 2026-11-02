// 音を鳴らす共通部分（メトロノームと音階で同じものを使う）

let sharedAudioContext = null;
let referencePitch = 442; // 基準のA（ラ）の周波数。チューナーの設定と共通

function setReferencePitch(hz) {
  referencePitch = hz;
}

// iPhone（Safari 17以降）での音の扱い方を切り替える
// 普段は消音スイッチがオンでも鳴る「再生専用」、マイクを使うあいだは「再生と録音」にする
function setAudioSessionForMic(useMic) {
  if (navigator.audioSession) {
    navigator.audioSession.type = useMic ? 'play-and-record' : 'playback';
  }
}

// マイクを使い始める（失敗したら音の扱い方を元に戻す）
async function openMicrophone() {
  setAudioSessionForMic(true);
  try {
    // 楽器の音をそのまま拾うため、通話用の自動補正は切る
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    setAudioSessionForMic(false);
    throw e;
  }
}

function closeMicrophone(stream) {
  stream.getTracks().forEach((track) => track.stop());
  setAudioSessionForMic(false);
}

function getAudioContext() {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedAudioContext;
}

function playClick(ctx, destination, time, strong) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = strong ? 1600 : 1000;
  gain.gain.setValueAtTime(strong ? 1 : 0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.06);
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
