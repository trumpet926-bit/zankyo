// 設定の保存と読み込み（この端末のブラウザ内に保存）

const STORAGE_KEY = 'practice-app-settings';

const DEFAULT_SETTINGS = {
  bpm: 100,
  beats: 4,
  accent: true,
  rhythm: 'quarter',
  metroSound: true, // メトロノームの音
  metroLight: true, // メトロノームの光
  syncId: null, // みんなで合わせるときの、この端末の番号（初回に自動で決める）
  syncName: null, // この端末の名前（江戸時代風、初回に自動で決める）
  syncOffsetMs: 0, // 音のタイミング補正（ミリ秒、プラスで遅らせる）
  scaleKey: 0, // 0=C 〜 11=B
  scaleType: 'major',
  scaleOctave: 0,
  scaleTransposition: 0, // 移調楽器：楽譜の音が実音より何半音高いか（0=C、2=B♭管、9=E♭管、7=F管）
  scaleBpm: 80,
  notesPerBeat: 0.5, // 音階の音の長さ（0.5=2分音符、1=4分音符、2=8分音符）
  halfNoteDefault: true, // 音階を2分音符を基本にした版に切り替え済みか
  scaleClick: true,
  countIn: true,
  scaleRepeat: false,
  scaleSelfPlay: false, // 自分で吹く（音階は鳴らさず、楽譜を光らせるだけ）
  scaleDrone: false, // 音階の主音をのばし続ける（ドローン）
  scaleDroneVolume: 0.5,
  scaleRelative: false, // 平行調の音階も続けて
  a4: 442, // 基準のA（ラ）の周波数
  tunerSensitivity: 4, // 1=鈍い 〜 5=敏感
  droneMidi: 70, // 基準音の高さ（70 = B♭4）
  droneTimbre: 'fork', // 基準音の音色
  droneVolume: 0.6, // 基準音の音量
  recWithMetronome: false,
  metroViaElement: false, // メトロノームを相手の声と同じ部品から鳴らす（オンライン合奏で聞こえないパソコン向け）
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    // 以前の版では楽器ごとに保存していたので、数値でなければ初期値に戻す
    if (typeof settings.scaleOctave !== 'number') settings.scaleOctave = 0;
    // 音階を2分音符を基本にした版に変えたので、以前から使っている人も一度だけ2分音符にする
    if (saved && !saved.halfNoteDefault) {
      settings.notesPerBeat = 0.5;
      settings.halfNoteDefault = true;
    }
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
