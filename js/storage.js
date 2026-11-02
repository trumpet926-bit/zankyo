// 設定の保存と読み込み（この端末のブラウザ内に保存）

const STORAGE_KEY = 'practice-app-settings';

const DEFAULT_SETTINGS = {
  bpm: 100,
  beats: 4,
  accent: true,
  rhythm: 'quarter',
  scaleKey: 0, // 0=C 〜 11=B
  scaleType: 'major',
  scaleOctave: 0,
  scaleBpm: 80,
  notesPerBeat: 1,
  scaleClick: true,
  countIn: true,
  scaleRepeat: false,
  a4: 442, // 基準のA（ラ）の周波数
  tunerSensitivity: 4, // 1=鈍い 〜 5=敏感
  recWithMetronome: false,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    // 以前の版では楽器ごとに保存していたので、数値でなければ初期値に戻す
    if (typeof settings.scaleOctave !== 'number') settings.scaleOctave = 0;
    return settings;
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // 保存できない環境（プライベートブラウズなど）でも動作は続ける
  }
}
