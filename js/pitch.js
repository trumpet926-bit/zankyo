// 音の高さ（周波数）を求める（YIN法）
// buf: マイクの波形データ、戻り値: 周波数(Hz)。音が小さい・はっきりしないときは null

function detectPitch(buf, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null; // 音が小さすぎる

  const half = Math.floor(buf.length / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / 2500)); // 2500Hz まで
  const maxTau = Math.min(half - 2, Math.floor(sampleRate / 40)); // 40Hz まで

  // 波形をずらして重ねたときの差
  const diff = new Float32Array(maxTau + 2);
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = buf[i] - buf[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // 差を正規化する
  const cmnd = new Float32Array(maxTau + 2);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    running += diff[tau];
    cmnd[tau] = running ? (diff[tau] * tau) / running : 1;
  }

  // 差が十分小さくなる最初の位置（＝1周期の長さ）を探す
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < 0.15) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // 前後の値から、より細かい位置を推定する
  const a = cmnd[tau - 1];
  const b = cmnd[tau];
  const c = cmnd[tau + 1];
  const denom = a - 2 * b + c;
  const shift = denom ? (a - c) / (2 * denom) : 0;
  return sampleRate / (tau + shift);
}

// 周波数から、いちばん近い音とずれ（セント）を求める
function frequencyToNote(freq, a4) {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  return {
    name: KEY_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: (midiFloat - midi) * 100,
  };
}
