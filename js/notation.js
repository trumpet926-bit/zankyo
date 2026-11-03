// リズムを楽譜どおりの音符で描く（1拍分、SVG）

const HEAD_Y = 34; // 符頭（音符の玉）の高さ
const STEM_TOP = 12; // 符尾（棒）の上端
const STEM_DX = 3.6; // 符頭の中心から符尾までの距離

// notes: 音符の位置（x）、dot: 付点、flag: 旗の数
// beams: [始まりの音符, 終わりの音符, 段（0=8分, 1=16分）]
// stubs: 短い連桁 [音符, 段, 向き(-1=左)]、tuplet: 3連符の印（'beam' か 'bracket'）
const RHYTHM_ICONS = {
  half: { notes: [{ x: 30, hollow: true }] },
  quarter: { notes: [{ x: 30 }] },
  eighth: { notes: [{ x: 18 }, { x: 42 }], beams: [[0, 1, 0]] },
  triplet: { notes: [{ x: 12 }, { x: 30 }, { x: 48 }], beams: [[0, 2, 0]], tuplet: 'beam' },
  sixteenth: { notes: [{ x: 9 }, { x: 23 }, { x: 37 }, { x: 51 }], beams: [[0, 3, 0], [0, 3, 1]] },
  shuffle: { notes: [{ x: 16 }, { x: 44, flag: 1 }], tuplet: 'bracket' },
  dotted: { notes: [{ x: 14, dot: true }, { x: 46 }], beams: [[0, 1, 0]], stubs: [[1, 1, -1]] },
  'eighth-two16': { notes: [{ x: 10 }, { x: 30 }, { x: 48 }], beams: [[0, 2, 0], [1, 2, 1]] },
  'two16-eighth': { notes: [{ x: 10 }, { x: 28 }, { x: 48 }], beams: [[0, 2, 0], [0, 1, 1]] },
};

function rhythmIcon(id) {
  const spec = RHYTHM_ICONS[id];
  const stemX = (n) => n.x + STEM_DX;
  const beamY = (level) => STEM_TOP + level * 5.5;
  let svg = '';

  spec.notes.forEach((n) => {
    // 2分音符は白い（中の抜けた）玉で描く
    svg += n.hollow
      ? `<ellipse cx="${n.x}" cy="${HEAD_Y}" rx="4" ry="2.7" transform="rotate(-20 ${n.x} ${HEAD_Y})" fill="none" stroke="currentColor" stroke-width="1.7"/>`
      : `<ellipse cx="${n.x}" cy="${HEAD_Y}" rx="4.6" ry="3.3" transform="rotate(-20 ${n.x} ${HEAD_Y})"/>`;
    svg += `<rect x="${stemX(n)}" y="${STEM_TOP}" width="1.4" height="${HEAD_Y - STEM_TOP - 1}"/>`;
    if (n.dot) svg += `<circle cx="${n.x + 9}" cy="${HEAD_Y - 1}" r="1.7"/>`;
    if (n.flag) {
      const x = stemX(n) + 1.4;
      const y = STEM_TOP;
      svg += `<path d="M${x} ${y} C${x + 1} ${y + 6} ${x + 9} ${y + 8} ${x + 5} ${y + 18} C${x + 6} ${y + 11} ${x + 2} ${y + 9} ${x} ${y + 8} Z"/>`;
    }
  });

  (spec.beams || []).forEach(([from, to, level]) => {
    const x1 = stemX(spec.notes[from]);
    const x2 = stemX(spec.notes[to]) + 1.4;
    svg += `<rect x="${x1}" y="${beamY(level)}" width="${x2 - x1}" height="3.6"/>`;
  });

  (spec.stubs || []).forEach(([index, level, dir]) => {
    const x = stemX(spec.notes[index]);
    const len = 8;
    svg += `<rect x="${dir < 0 ? x - len + 1.4 : x}" y="${beamY(level)}" width="${len}" height="3.6"/>`;
  });

  if (spec.tuplet) {
    const first = stemX(spec.notes[0]);
    const last = stemX(spec.notes[spec.notes.length - 1]) + 1.4;
    const mid = (first + last) / 2;
    if (spec.tuplet === 'bracket') {
      // 連桁がないときは、括弧で3連符を示す
      const l = spec.notes[0].x - 4;
      const r = last + 2;
      svg += `<path d="M${l} 10 V6 H${mid - 5} M${mid + 5} 6 H${r} V10" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
    }
    svg += `<text x="${mid}" y="${spec.tuplet === 'bracket' ? 9.5 : 9}" font-size="10" font-weight="700" font-style="italic" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif">3</text>`;
  }

  return `<svg class="rhythm-icon" viewBox="0 0 64 44" fill="currentColor" aria-hidden="true">${svg}</svg>`;
}
