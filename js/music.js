// 音楽の計算（画面に依存しない部分）
// 音名はすべて実音（実際に鳴る音）

const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// 短調では一般的な書き方に合わせる（D♭短調 → C♯短調 など）
const MINOR_KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// ---------- 音階 ----------

const SCALE_TYPES = [
  { id: 'major', name: '長音階' },
  { id: 'natural-minor', name: '自然的短音階', minor: true },
  { id: 'harmonic-minor', name: '和声的短音階', minor: true },
  { id: 'melodic-minor', name: '旋律的短音階', minor: true },
  { id: 'chromatic', name: '半音階' },
  { id: 'thirds', name: '3度音階（長調）' },
];

const INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodicUp: [0, 2, 3, 5, 7, 9, 11],
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

function keyNamesFor(typeId) {
  const type = SCALE_TYPES.find((t) => t.id === typeId);
  return type && type.minor ? MINOR_KEY_NAMES : KEY_NAMES;
}

// 調の何番目の音か（degree）を、正しい音名とMIDI番号にする
function diatonicNote(tonicName, tonicMidi, intervals, degree) {
  const tonicLetter = LETTERS.indexOf(tonicName[0]);
  const tonicAcc = tonicName.includes('♯') ? 1 : tonicName.includes('♭') ? -1 : 0;
  const tonicPc = (LETTER_PC[tonicLetter] + tonicAcc + 12) % 12;
  const d = ((degree % 7) + 7) % 7;
  const octave = Math.floor(degree / 7);
  const letter = (tonicLetter + d) % 7;
  let acc = (tonicPc + intervals[d]) % 12 - LETTER_PC[letter];
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  return {
    name: LETTERS[letter] + ACCIDENTALS[acc],
    midi: tonicMidi + octave * 12 + intervals[d],
  };
}

// 音階の音の並びを、上行と下行に分けて返す：{ up: [{ name, midi }, ...], down: [...] }
// 下行は折り返しの音（いちばん上の音）から始める
function buildScale(typeId, tonicName, tonicMidi) {
  const up = [0, 1, 2, 3, 4, 5, 6, 7];
  const down = [7, 6, 5, 4, 3, 2, 1, 0];
  const diatonic = (degrees, intervals) =>
    degrees.map((deg) => diatonicNote(tonicName, tonicMidi, intervals, deg));

  switch (typeId) {
    case 'major':
      return { up: diatonic(up, INTERVALS.major), down: diatonic(down, INTERVALS.major) };
    case 'natural-minor':
      return { up: diatonic(up, INTERVALS.natural), down: diatonic(down, INTERVALS.natural) };
    case 'harmonic-minor':
      return { up: diatonic(up, INTERVALS.harmonic), down: diatonic(down, INTERVALS.harmonic) };
    case 'melodic-minor':
      return { up: diatonic(up, INTERVALS.melodicUp), down: diatonic(down, INTERVALS.natural) };
    case 'thirds': {
      const thirdsUp = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7];
      const thirdsDown = [7, 5, 6, 4, 5, 3, 4, 2, 3, 1, 2, 0, 1, -1, 0];
      return { up: diatonic(thirdsUp, INTERVALS.major), down: diatonic(thirdsDown, INTERVALS.major) };
    }
    case 'chromatic': {
      // 上がるときは♯、下りるときは♭で書く（主音は調の書き方のまま）
      const upNotes = [];
      const downNotes = [];
      for (let i = 0; i <= 12; i++) {
        const pc = (tonicMidi + i) % 12;
        upNotes.push({ name: i % 12 === 0 ? tonicName : SHARP_NAMES[pc], midi: tonicMidi + i });
      }
      for (let i = 12; i >= 0; i--) {
        const pc = (tonicMidi + i) % 12;
        downNotes.push({ name: i % 12 === 0 ? tonicName : FLAT_NAMES[pc], midi: tonicMidi + i });
      }
      return { up: upNotes, down: downNotes };
    }
  }
  return { up: [], down: [] };
}

// 例：B♭ と 58 → "B♭3"
function nameWithOctave(name, midi) {
  return name + (Math.floor(midi / 12) - 1);
}
