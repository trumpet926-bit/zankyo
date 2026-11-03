// みんなで合わせる：基準の台に自動で合わせる（音合わせ）
// 基準の台は高い音、合わせる台は低い音を同じ時刻に鳴らし、合わせる台のマイクで両方を聞いて、
// 自分の音が何ミリ秒遅れて（早く）届いたかを測る。マイクの遅れは両方の音に同じだけかかるので打ち消し合う

const CALIB_BEATS = 10; // 鳴らす回数
const CALIB_INTERVAL_MS = 600; // 鳴らす間隔
const CALIB_REF_HZ = 2500; // 基準の台の音
const CALIB_SELF_HZ = 1000; // 合わせる台の音
const CALIB_WINDOW = 256; // 音の大きさを調べる区切りの長さ（サンプル数）
const CALIB_HOP = 16; // 区切りをずらす幅（サンプル数）

class CalibError extends Error {}

// マイクの音をそのまま集める
function startCalibCapture(stream) {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0; // 集めるだけで、スピーカーには出さない
  const chunks = [];
  processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor).connect(silent).connect(ctx.destination);
  return {
    stop() {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silent.disconnect();
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let pos = 0;
      chunks.forEach((c) => {
        all.set(c, pos);
        pos += c.length;
      });
      return all;
    },
  };
}

// 音合わせ用の短い音
function playCalibBeep(ctx, destination, freq, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.8, time + 0.003);
  gain.gain.setValueAtTime(0.8, time + 0.04);
  gain.gain.linearRampToValueAtTime(0, time + 0.06);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.07);
}

// ある高さの音だけの大きさを、時間を追って調べる（ゲルツェルの方法）
function calibBandEnvelope(x, sampleRate, freq) {
  const k = 2 * Math.cos((2 * Math.PI * freq) / sampleRate);
  const win = new Float32Array(CALIB_WINDOW);
  for (let i = 0; i < CALIB_WINDOW; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (CALIB_WINDOW - 1));
  const frames = Math.max(0, Math.floor((x.length - CALIB_WINDOW) / CALIB_HOP) + 1);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * CALIB_HOP;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < CALIB_WINDOW; i++) {
      const s0 = x[start + i] * win[i] + k * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    env[f] = s1 * s1 + s2 * s2 - k * s1 * s2;
  }
  return env;
}

// 山の頂上から戻って、山の高さの 1/4 を超えた位置を音の立ち上がりとする（区切りの間は直線で補う）
function calibOnsetBefore(env, peak, lowest) {
  const level = env[peak] / 4;
  let i = peak;
  while (i > lowest && env[i - 1] >= level) i--;
  if (i === lowest) return i;
  return i - 1 + (level - env[i - 1]) / (env[i] - env[i - 1]);
}

function calibMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// 戻り値：自分の音が基準の音より何ミリ秒遅れて届いたか（早いときはマイナス）
function measureCalibLag(x, sampleRate) {
  const framesPerMs = sampleRate / CALIB_HOP / 1000;
  const ref = calibBandEnvelope(x, sampleRate, CALIB_REF_HZ);
  const self = calibBandEnvelope(x, sampleRate, CALIB_SELF_HZ);
  if (!ref.length) throw new CalibError('うまく測れませんでした。もう一度お試しください。');
  const refMax = ref.reduce((a, b) => Math.max(a, b), 0);
  const selfMax = self.reduce((a, b) => Math.max(a, b), 0);

  // 基準の音が鳴った位置を探す
  const refOnsets = [];
  if (refMax > calibMedian(ref) * 100) {
    const threshold = refMax * 0.1;
    let i = 0;
    while (i < ref.length) {
      if (ref[i] < threshold) {
        i++;
        continue;
      }
      let peak = i;
      const end = Math.min(ref.length, i + Math.round(80 * framesPerMs));
      for (let j = i; j < end; j++) if (ref[j] > ref[peak]) peak = j;
      refOnsets.push(calibOnsetBefore(ref, peak, Math.max(0, i - Math.round(40 * framesPerMs))));
      i = peak + Math.round(300 * framesPerMs);
    }
  }
  if (refOnsets.length < 5) {
    throw new CalibError('基準の台の音が聞こえませんでした。基準の台の画面を開いたまま、音量を上げてもらってください。');
  }

  // それぞれの基準の音の前後 0.25 秒から、自分の音を探す
  const diffs = [];
  if (selfMax > calibMedian(self) * 100) {
    const range = Math.round(250 * framesPerMs);
    refOnsets.forEach((r) => {
      const from = Math.max(0, Math.floor(r) - range);
      const to = Math.min(self.length, Math.floor(r) + range);
      let peak = from;
      for (let j = from; j < to; j++) if (self[j] > self[peak]) peak = j;
      if (self[peak] < selfMax * 0.1) return;
      diffs.push((calibOnsetBefore(self, peak, from) - r) / framesPerMs);
    });
  }
  if (diffs.length < 5) throw new CalibError('自分の台の音が聞こえませんでした。音量を上げてください。');

  // まわりの音で外れた回は除き、そろっている回の平均を使う
  const mid = calibMedian(diffs);
  const good = diffs.filter((d) => Math.abs(d - mid) <= 10);
  if (good.length < 5 || good.length < diffs.length * 0.6) {
    throw new CalibError('まわりの音でうまく測れませんでした。静かにしてもう一度お試しください。');
  }
  return good.reduce((a, b) => a + b, 0) / good.length;
}
