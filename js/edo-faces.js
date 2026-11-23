// みんなで合わせる：江戸の50人と、浮世絵風の顔（SVG）
// 顔・髪・かぶり物・表情・着物・持ち物の部品を組み合わせて描く。線は墨色、色は平たく（浮世絵の版画のように）
// 名前は sync.js の EDO_NAMES と同じ50人。ここにない名前（古い版の名前など）は、名前から決まるだれかの顔になる

const EDO_INK = '#1F1D24';
const EDO_SKIN = '#F7E6D3';
const EDO_COLORS = { yellow: '#F2B705', red: '#E4572E', blue: '#2F5DC8', green: '#2E8B57', cream: '#F7F0E1', navy: '#1F2A4A', rose: '#B8325A', pink: '#F2A6B8', brown: '#8A6A3A', purple: '#6B4C9A', ink: '#2B2F45', teal: '#2A7F8A', gray: '#4A4458' };

// hair：髪・かぶり物、head：鉢巻などの上乗せ、face：表情・お面、body：着物の形、pattern：柄、prop：持ち物、bg：背景
const EDO_PEOPLE = [
  // ---- 男の人 ----
  { name: '八兵衛', role: '団子好き', sex: 'm', hair: 'mage', face: 'smile', kimono: 'blue', pattern: 'stripe', bg: 'yellow', prop: 'dango' },
  { name: '与作', role: '太鼓たたき', sex: 'm', hair: 'mage', head: 'hachimaki-red', face: 'shout', kimono: 'ink', pattern: 'stripe', bg: 'red', prop: 'taiko' },
  { name: '弥七', role: '忍び', sex: 'm', hair: 'hood', kimono: 'ink', bg: 'blue', prop: 'shuriken' },
  { name: '佐吉', role: '大工', sex: 'm', hair: 'mage', head: 'hachimaki-white', kimono: 'blue', pattern: 'kanji-dai', bg: 'cream', prop: 'hammer' },
  { name: '喜助', role: '魚売り', sex: 'm', hair: 'mage', head: 'tenugui', face: 'shout', kimono: 'teal', pattern: 'stripe', bg: 'blue', prop: 'fish' },
  { name: '源内', role: '発明家', sex: 'm', hair: 'sohatsu', face: 'sly', kimono: 'brown', pattern: 'dots', bg: 'yellow', prop: 'elekiter' },
  { name: '清次郎', role: '色男', sex: 'm', hair: 'mage', face: 'wink', kimono: 'purple', pattern: 'asanoha', bg: 'pink', prop: 'kiseru' },
  { name: '吉兵衛', role: '商人', sex: 'm', hair: 'mage', face: 'smile', kimono: 'brown', pattern: 'check', bg: 'green', prop: 'soroban' },
  { name: '半七', role: '岡っ引き', sex: 'm', hair: 'mage', face: 'sly', kimono: 'ink', pattern: 'stripe', bg: 'red', prop: 'jitte' },
  { name: '又兵衛', role: '浮世絵師', sex: 'm', hair: 'sohatsu', kimono: 'green', pattern: 'check', bg: 'cream', prop: 'brush' },
  { name: '甚六', role: '力士', sex: 'm', hair: 'sumo', face: 'sumo', body: 'bare', bg: 'red', prop: 'none' },
  { name: '伊之助', role: '歌舞伎役者', sex: 'm', hair: 'mage', face: 'kabuki', kimono: 'red', pattern: 'mimasu', bg: 'ink', prop: 'none' },
  { name: '長吉', role: '凧あげ小僧', sex: 'm', hair: 'child', face: 'smile', kimono: 'yellow', pattern: 'dots', bg: 'blue', prop: 'kite' },
  { name: '権兵衛', role: '百姓', sex: 'm', hair: 'mage', head: 'kasa', kimono: 'brown', bg: 'yellow', prop: 'rice' },
  { name: '徳右衛門', role: 'ご隠居', sex: 'm', hair: 'old', face: 'old', kimono: 'gray', pattern: 'check', bg: 'green', prop: 'tea' },
  { name: '新三郎', role: '侍', sex: 'm', hair: 'mage', body: 'kamishimo', kimono: 'blue', pattern: 'plain', bg: 'cream', prop: 'sword' },
  { name: '平助', role: '飛脚', sex: 'm', hair: 'mage', head: 'hachimaki-blue', face: 'shout', kimono: 'cream', pattern: 'stripe', bg: 'yellow', prop: 'letterbox' },
  { name: '庄助', role: '朝寝朝酒朝湯', sex: 'm', hair: 'mage', face: 'drunk', kimono: 'teal', pattern: 'check', bg: 'pink', prop: 'sake' },
  { name: '太郎吉', role: '金魚売り', sex: 'm', hair: 'mage', head: 'tenugui', face: 'smile', kimono: 'cream', pattern: 'stripe', bg: 'teal', prop: 'goldfish' },
  { name: '文七', role: 'そば屋', sex: 'm', hair: 'mage', head: 'hachimaki-white', kimono: 'ink', pattern: 'kanji-soba', bg: 'yellow', prop: 'soba' },
  { name: '金次', role: 'ほっかむり泥棒', sex: 'm', hair: 'thief', face: 'sly', kimono: 'gray', pattern: 'stripe', bg: 'navy', prop: 'furoshiki' },
  { name: '茂兵衛', role: '提灯屋', sex: 'm', hair: 'mage', kimono: 'brown', pattern: 'plain', bg: 'navy', prop: 'lantern' },
  { name: '辰五郎', role: '火消し', sex: 'm', hair: 'mage', head: 'hachimaki-white', kimono: 'ink', pattern: 'kanji-me', bg: 'red', prop: 'matoi' },
  { name: '利助', role: '独楽まわし', sex: 'm', hair: 'child', face: 'shout', kimono: 'red', pattern: 'check', bg: 'yellow', prop: 'koma' },
  { name: '仙蔵', role: '尺八吹き', sex: 'm', hair: 'komuso', kimono: 'gray', bg: 'green', prop: 'shakuhachi' },
  { name: '亀吉', role: 'ひょっとこ', sex: 'm', hair: 'mage', head: 'hachimaki-dots', face: 'hyottoko', kimono: 'blue', pattern: 'dots', bg: 'yellow', prop: 'none' },
  { name: '久蔵', role: '天狗', sex: 'm', hair: 'tengu', face: 'tengu', kimono: 'cream', pattern: 'plain', bg: 'green', prop: 'leaf' },
  { name: '与兵衛', role: 'お坊さん', sex: 'm', hair: 'bald', face: 'smile', body: 'monk', kimono: 'ink', bg: 'yellow', prop: 'juzu' },
  { name: '彦六', role: '狐のお面', sex: 'm', hair: 'mage', face: 'fox', kimono: 'red', pattern: 'asanoha', bg: 'navy', prop: 'none' },
  { name: '善八', role: '篠笛吹き', sex: 'm', hair: 'mage', kimono: 'green', pattern: 'stripe', bg: 'cream', prop: 'fue' },
  // ---- 女の人 ----
  { name: 'お菊', role: '茶屋娘', sex: 'f', hair: 'shimada', face: 'smile', kimono: 'red', pattern: 'check', bg: 'green', prop: 'tea' },
  { name: 'お松', role: '三味線弾き', sex: 'f', hair: 'shimada', kimono: 'red', pattern: 'asanoha', bg: 'yellow', prop: 'bachi' },
  { name: 'おりん', role: '風鈴売り', sex: 'f', hair: 'shimada', kimono: 'blue', pattern: 'dots', bg: 'cream', prop: 'furin' },
  { name: 'お千代', role: '琴弾き', sex: 'f', hair: 'shimada', kimono: 'purple', pattern: 'wave', bg: 'pink', prop: 'koto' },
  { name: 'おはな', role: '花売り', sex: 'f', hair: 'shimada', face: 'smile', kimono: 'yellow', pattern: 'flower', bg: 'blue', prop: 'flowers' },
  { name: 'おせん', role: '看板娘', sex: 'f', hair: 'shimada', face: 'wink', kimono: 'rose', pattern: 'dots', bg: 'yellow', prop: 'uchiwa' },
  { name: 'お糸', role: '機織り', sex: 'f', hair: 'marumage', kimono: 'blue', pattern: 'asanoha', bg: 'cream', prop: 'spool' },
  { name: 'おとき', role: '雨の日の娘', sex: 'f', hair: 'shimada', kimono: 'green', pattern: 'dots', bg: 'blue', prop: 'umbrella' },
  { name: 'お鶴', role: '折り鶴名人', sex: 'f', hair: 'shimada', kimono: 'cream', pattern: 'crane', bg: 'red', prop: 'crane' },
  { name: 'お駒', role: '将棋指し', sex: 'f', hair: 'marumage', face: 'sly', kimono: 'brown', pattern: 'check', bg: 'yellow', prop: 'shogi' },
  { name: 'お梅', role: '梅見', sex: 'f', hair: 'shimada', face: 'smile', kimono: 'pink', pattern: 'flower', bg: 'cream', prop: 'plum' },
  { name: 'おみつ', role: 'おにぎり屋', sex: 'f', hair: 'marumage', head: 'tenugui', face: 'smile', kimono: 'teal', pattern: 'stripe', bg: 'yellow', prop: 'onigiri' },
  { name: 'お照', role: '花魁', sex: 'f', hair: 'oiran', face: 'oiran', body: 'oiran', kimono: 'red', pattern: 'flower', bg: 'purple', prop: 'kiseru' },
  { name: 'おしの', role: 'くノ一', sex: 'f', hair: 'hood-pink', kimono: 'rose', bg: 'navy', prop: 'kunai' },
  { name: 'お蝶', role: '踊り手', sex: 'f', hair: 'shimada', kimono: 'rose', pattern: 'butterfly', bg: 'green', prop: 'fan' },
  { name: 'おふく', role: 'おかめ', sex: 'f', hair: 'okame', face: 'okame', kimono: 'red', pattern: 'flower', bg: 'yellow', prop: 'none' },
  { name: 'お吉', role: '芸者', sex: 'f', hair: 'shimada', face: 'oiran', kimono: 'ink', pattern: 'wave', bg: 'red', prop: 'mirror' },
  { name: 'お夏', role: '花火見物', sex: 'f', hair: 'shimada', face: 'smile', kimono: 'blue', pattern: 'flower', bg: 'hanabi', prop: 'sparkler' },
  { name: 'おまさ', role: '宿の女将', sex: 'f', hair: 'marumage', face: 'smile', kimono: 'brown', pattern: 'check', bg: 'green', prop: 'shamoji' },
  { name: 'お竹', role: 'かぐや姫', sex: 'f', hair: 'hime', kimono: 'red', pattern: 'flower', bg: 'moon', prop: 'bamboo' },
];

function edoPerson(name) {
  const found = EDO_PEOPLE.find((p) => p.name === name);
  if (found) return found;
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return EDO_PEOPLE[h % EDO_PEOPLE.length];
}

function edoColor(c) {
  return EDO_COLORS[c] || c || EDO_COLORS.blue;
}

let edoSvgCount = 0;
function edoFaceSvg(name, size = 64) {
  const p = edoPerson(name);
  const id = `edo${++edoSvgCount}`;
  const s = [];
  s.push(`<clipPath id="${id}c"><circle cx="32" cy="32" r="31"/></clipPath><g clip-path="url(#${id}c)">`);
  s.push(edoBackground(p));
  s.push(edoBody(p, id));
  s.push(edoHairBack(p));
  s.push(edoHead(p));
  s.push(edoFace(p));
  s.push(edoHairFront(p));
  s.push(edoHeadExtra(p));
  s.push(edoMask(p));
  s.push(edoProp(p));
  s.push('</g>');
  s.push(`<circle cx="32" cy="32" r="31" fill="none" stroke="${EDO_INK}" stroke-width="1.6"/>`);
  return `<svg class="edo-face" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${p.name}（${p.role}）">${s.join('')}</svg>`;
}

// ---------- 背景 ----------
function edoBackground(p) {
  if (p.bg === 'moon') {
    return `<rect width="64" height="64" fill="${EDO_COLORS.navy}"/><circle cx="48" cy="15" r="9" fill="#F7E08A"/>`
      + `<path d="M6 64 L6 30 M10 64 L10 36" stroke="#3E8B5A" stroke-width="3"/><path d="M4.5 40 h3 M8.5 46 h3" stroke="#2E6B45" stroke-width="1"/>`;
  }
  if (p.bg === 'hanabi') {
    let s = `<rect width="64" height="64" fill="${EDO_COLORS.navy}"/>`;
    for (const [cx, cy, c] of [[14, 14, '#F2B705'], [50, 12, '#E4572E'], [52, 32, '#F2A6B8']]) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        s += `<path d="M${cx + Math.cos(a) * 2.5} ${cy + Math.sin(a) * 2.5} L${cx + Math.cos(a) * 7} ${cy + Math.sin(a) * 7}" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`;
      }
    }
    return s;
  }
  const bg = edoColor(p.bg);
  const light = ['cream', 'pink', 'yellow'].includes(p.bg) ? 'rgba(31,29,36,0.10)' : 'rgba(255,255,255,0.32)';
  let s = `<rect width="64" height="64" fill="${bg}"/>`;
  // 青海波（波の模様）
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col < 6; col++) {
      const cx = col * 14 + (row % 2) * 7;
      const cy = 50 + row * 7;
      for (const r of [7, 4.5, 2]) s += `<path d="M${cx - r} ${cy} a${r} ${r} 0 0 1 ${r * 2} 0" fill="none" stroke="${light}" stroke-width="1"/>`;
    }
  }
  return s;
}

// ---------- 着物 ----------
const EDO_BODY_PATH = 'M6 66 Q9 47 32 45 Q55 47 58 66 Z';
function edoBody(p, id) {
  const ink = EDO_INK;
  const kimono = edoColor(p.kimono);
  if (p.body === 'bare') {
    // 力士：はだかの肩と胸
    return `<path d="M2 66 Q4 45 32 43 Q60 45 62 66 Z" fill="${EDO_SKIN}" stroke="${ink}" stroke-width="1.4"/>`
      + `<path d="M22 56 q4 3 8 0 M34 56 q4 3 8 0" stroke="${ink}" stroke-width="0.9" fill="none"/>`
      + `<rect x="28.5" y="37" width="7" height="8" fill="${EDO_SKIN}"/>`;
  }
  let s = '';
  if (p.body === 'kamishimo') {
    // 侍の裃：肩が張り出す
    s += `<path d="M2 50 L16 45.5 L22 50 Z M62 50 L48 45.5 L42 50 Z" fill="${kimono}" stroke="${ink}" stroke-width="1.2"/>`;
  }
  s += `<path d="${EDO_BODY_PATH}" fill="${kimono}" stroke="${ink}" stroke-width="1.4"/>`;
  s += edoPattern(p, id);
  if (p.body === 'monk') {
    s += `<path d="M14 66 L44 45.5 L50 47 L22 66 Z" fill="#C99A3C" stroke="${ink}" stroke-width="1"/>`; // 袈裟
  }
  if (p.body === 'oiran') {
    // 花魁：襟を何枚も重ね、首元を大きく見せる
    s += `<path d="M20 46 L32 62 L44 46" fill="#F2B705" stroke="${ink}" stroke-width="1.1"/>`;
    s += `<path d="M22.5 45.6 L32 59 L41.5 45.6" fill="#E4572E" stroke="${ink}" stroke-width="1"/>`;
    s += `<path d="M25 45.3 L32 55.5 L39 45.3" fill="#FBF6EA" stroke="${ink}" stroke-width="0.9"/>`;
  } else {
    s += `<path d="M24 45.5 L32 58 L40 45.5" fill="${p.sex === 'f' ? '#E4572E' : '#F7F0E1'}" stroke="${ink}" stroke-width="1.2"/>`;
    s += `<path d="M26.5 45.2 L32 54 L37.5 45.2" fill="#FBF6EA" stroke="${ink}" stroke-width="1"/>`;
  }
  s += `<rect x="28.5" y="37" width="7" height="8.5" fill="${p.face === 'tengu' ? '#D8452E' : EDO_SKIN}"/>`;
  return s;
}

function edoPattern(p, id) {
  const clip = `<clipPath id="${id}k"><path d="${EDO_BODY_PATH}"/></clipPath>`;
  const w = 'rgba(255,255,255,0.45)';
  const dark = ['cream', 'yellow', 'pink'].includes(p.kimono);
  const line = dark ? 'rgba(31,29,36,0.35)' : w;
  let b = '';
  switch (p.pattern) {
    case 'stripe':
      for (let x = 4; x < 62; x += 5) b += `<path d="M${x} 44 L${x - 3} 66" stroke="${line}" stroke-width="1.6"/>`;
      break;
    case 'check':
      for (let x = 4; x < 62; x += 6) b += `<path d="M${x} 44 V66" stroke="${line}" stroke-width="1.2"/>`;
      for (let y = 48; y < 66; y += 6) b += `<path d="M0 ${y} H64" stroke="${line}" stroke-width="1.2"/>`;
      break;
    case 'dots':
      for (let x = 8; x < 60; x += 6) for (let y = 49; y < 66; y += 6) b += `<circle cx="${x + ((y / 6) % 2) * 3}" cy="${y}" r="1.2" fill="${dark ? '#E4572E' : '#FBF6EA'}"/>`;
      break;
    case 'asanoha':
      for (let x = 6; x < 62; x += 8) for (let y = 48; y < 66; y += 8) b += `<path d="M${x} ${y - 3} L${x} ${y + 3} M${x - 3} ${y - 1.5} L${x + 3} ${y + 1.5} M${x - 3} ${y + 1.5} L${x + 3} ${y - 1.5}" stroke="${line}" stroke-width="0.8"/>`;
      break;
    case 'wave':
      for (let y = 50; y < 66; y += 5) b += `<path d="M0 ${y} q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" stroke="${line}" stroke-width="1" fill="none"/>`;
      break;
    case 'flower':
      for (const [x, y] of [[13, 55], [48, 54], [21, 63], [42, 63], [55, 61]]) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          b += `<circle cx="${x + Math.cos(a) * 1.8}" cy="${y + Math.sin(a) * 1.8}" r="1.4" fill="${dark ? '#E4572E' : '#FBF6EA'}"/>`;
        }
        b += `<circle cx="${x}" cy="${y}" r="0.9" fill="#F2B705"/>`;
      }
      break;
    case 'butterfly':
      for (const [x, y] of [[13, 56], [47, 55], [22, 63], [52, 63]]) b += `<path d="M${x} ${y} q-4 -4 -4 0 q0 3 4 0 q4 -4 4 0 q0 3 -4 0" fill="#F2B705"/>`;
      break;
    case 'crane':
      for (const [x, y] of [[14, 56], [48, 57]]) b += `<path d="M${x - 5} ${y} q5 -6 10 0 q-5 -2 -10 0 Z M${x} ${y - 2} l2 -3" fill="#E4572E" stroke="#E4572E" stroke-width="0.6"/>`;
      break;
    case 'mimasu': // 歌舞伎の三枡
      for (const [x, y] of [[14, 56], [48, 56]]) b += `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="none" stroke="#FBF6EA" stroke-width="1"/><rect x="${x - 2.4}" y="${y - 2.4}" width="4.8" height="4.8" fill="none" stroke="#FBF6EA" stroke-width="0.9"/><rect x="${x - 1}" y="${y - 1}" width="2" height="2" fill="#FBF6EA"/>`;
      break;
    case 'kanji-me':
    case 'kanji-dai':
    case 'kanji-soba': {
      const ch = { 'kanji-me': 'め', 'kanji-dai': '大', 'kanji-soba': 'そ' }[p.pattern];
      b += `<circle cx="47" cy="57" r="5" fill="#FBF6EA"/><text x="47" y="59.6" font-size="7" text-anchor="middle" fill="${EDO_INK}" font-family="serif">${ch}</text>`;
      break;
    }
    default:
      break;
  }
  return `${clip}<g clip-path="url(#${id}k)">${b}</g>`;
}

// ---------- 頭 ----------
function edoFaceSize(p) {
  if (p.face === 'sumo' || p.face === 'okame') return { rx: 12.5, ry: 12.2 };
  return { rx: 10.5, ry: 12 };
}

function edoSkin(p) {
  if (p.face === 'tengu') return '#D8452E';
  if (p.face === 'kabuki' || p.face === 'okame' || p.face === 'oiran') return '#FFFBF4';
  return EDO_SKIN;
}

function edoHead(p) {
  const { rx, ry } = edoFaceSize(p);
  return `<ellipse cx="32" cy="29.5" rx="${rx}" ry="${ry}" fill="${edoSkin(p)}" stroke="${EDO_INK}" stroke-width="1.4"/>`;
}

function edoHairBack(p) {
  const ink = EDO_INK;
  switch (p.hair) {
    case 'shimada':
    case 'marumage':
      return `<path d="M19 30 Q17 14 32 13 Q47 14 45 30 Q48 37 44 40 L20 40 Q16 37 19 30 Z" fill="${ink}"/>`;
    case 'okame':
      return `<path d="M17 32 Q15 14 32 13 Q49 14 47 32 Q49 38 45 41 L19 41 Q15 38 17 32 Z" fill="${ink}"/>`;
    case 'oiran':
      return `<path d="M15 31 Q12 10 32 8 Q52 10 49 31 Q52 38 46 41 L18 41 Q12 38 15 31 Z" fill="${ink}"/>`
        + `<ellipse cx="16" cy="27" rx="5" ry="7" fill="${ink}"/><ellipse cx="48" cy="27" rx="5" ry="7" fill="${ink}"/>`;
    case 'hime':
      return `<path d="M19 26 Q19 14 32 14 Q45 14 45 26 L45 44 L19 44 Z" fill="${ink}"/>`
        + `<path d="M17.5 38 L23 38 L23.6 63 L16.6 63 Z M41 38 L46.5 38 L47.4 63 L40.4 63 Z" fill="${ink}"/>`; // 長い髪は左右の房に（着物が見えるように）
    case 'sohatsu':
      return `<path d="M39 17 q7 -3 9 2 q-4 -0.5 -8 1.5 Z" fill="${ink}"/>`;
    case 'tengu':
      return `<path d="M17 34 Q12 18 22 13 Q32 6 42 13 Q52 18 47 34 Q50 40 44 42 L20 42 Q14 40 17 34 Z" fill="#F7F0E1" stroke="${ink}" stroke-width="1"/>`;
    default:
      return '';
  }
}

function edoHairFront(p) {
  const ink = EDO_INK;
  switch (p.hair) {
    case 'mage':
      return `<path d="M21.5 27 Q21 16.5 32 16.5 Q43 16.5 42.5 27 Q40 21 32 21 Q24 21 21.5 27 Z" fill="#C9D3E0" stroke="${ink}" stroke-width="1"/>` // 月代（そったところ）
        + `<path d="M21.5 27 Q20.5 21 23 19.5 L23.5 27 Z M42.5 27 Q43.5 21 41 19.5 L40.5 27 Z" fill="${ink}"/>` // 横の髪
        + `<path d="M29 17.5 q3 -4 9 -2.5 q-1.5 2.4 -9 2.5 Z" fill="${ink}"/>`; // ちょんまげ
    case 'sohatsu':
      return `<path d="M21.5 27 Q20 15 32 15.5 Q44 15 42.5 27 Q40 20 32 20.5 Q24 20 21.5 27 Z" fill="${ink}"/>`;
    case 'bald':
      return `<path d="M26 20.5 q4 -2.2 8 -0.8" stroke="#FFFFFF" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    case 'old':
      return `<path d="M26 20.5 q4 -2.2 8 -0.8" stroke="#FFFFFF" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.8"/>`
        + `<path d="M21.5 30 q-2 -5 1 -8 q1 4 2 5 Z M42.5 30 q2 -5 -1 -8 q-1 4 -2 5 Z" fill="#FBF6EA" stroke="${ink}" stroke-width="0.8"/>`;
    case 'sumo':
      return `<path d="M19.5 27 Q18.5 15.5 32 15.5 Q45.5 15.5 44.5 27 Q41 19.5 32 19.5 Q23 19.5 19.5 27 Z" fill="${ink}"/>`
        + `<path d="M25 13.5 Q32 6.5 39 13.5 Q35.5 15.5 32 14.6 Q28.5 15.5 25 13.5 Z" fill="${ink}"/><path d="M32 14.6 V18" stroke="${ink}" stroke-width="2"/>`;
    case 'child':
      return `<path d="M21.5 27 Q21 17 32 17 Q43 17 42.5 27 Q40 21 32 21 Q24 21 21.5 27 Z" fill="#C9D3E0" stroke="${ink}" stroke-width="1"/>`
        + `<ellipse cx="32" cy="19" rx="3" ry="2.2" fill="${ink}"/><circle cx="23.5" cy="21.5" r="2" fill="${ink}"/><circle cx="40.5" cy="21.5" r="2" fill="${ink}"/>`;
    case 'shimada':
      return `<path d="M21 27 Q22 18 32 18.5 Q42 18 43 27 Q38 21.5 32 22 Q26 21.5 21 27 Z" fill="${ink}"/>`
        + `<ellipse cx="32" cy="12" rx="8" ry="4.6" fill="${ink}"/><ellipse cx="32" cy="12.5" rx="3" ry="2" fill="#E4572E"/>`
        + `<path d="M40 11 l9 -4" stroke="#F2B705" stroke-width="1.6" stroke-linecap="round"/><circle cx="49.5" cy="6.8" r="1.8" fill="#E4572E"/>`
        + `<path d="M24 11 l-7 -2" stroke="#F2B705" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'marumage':
      return `<path d="M21 27 Q22 18 32 18.5 Q42 18 43 27 Q38 21.5 32 22 Q26 21.5 21 27 Z" fill="${ink}"/>`
        + `<ellipse cx="32" cy="13.5" rx="9" ry="5.2" fill="${ink}"/><path d="M24 15.5 Q32 19 40 15.5" stroke="#E4572E" stroke-width="1.6" fill="none"/>`
        + `<path d="M25.5 17.6 h13 v2.2 h-13 Z" fill="#8A6A3A"/>`; // くし
    case 'okame':
      return `<path d="M19.5 26 Q21 17 31.4 17.5 L32 21 L32.6 17.5 Q43 17 44.5 26 Q40 21 32 21 Q24 21 19.5 26 Z" fill="${ink}"/>`;
    case 'oiran': {
      let s = `<path d="M20.5 27 Q22 18 32 18.5 Q42 18 43.5 27 Q38 21.5 32 22 Q26 21.5 20.5 27 Z" fill="${ink}"/>`;
      s += `<ellipse cx="32" cy="10" rx="11" ry="5" fill="${ink}"/>`;
      s += `<path d="M22.5 13 h19 v2.4 h-19 Z" fill="#C99A3C"/>`; // 鼈甲のくし
      for (const [x2, y2] of [[6, 2], [10, -1], [15, -3], [49, -3], [54, -1], [58, 2]]) {
        const x1 = x2 < 32 ? 24 : 40;
        s += `<path d="M${x1} 11 L${x2} ${y2 + 6}" stroke="#F2B705" stroke-width="1.3" stroke-linecap="round"/>`;
      }
      s += `<circle cx="7" cy="8" r="1.8" fill="#E4572E"/><circle cx="57" cy="8" r="1.8" fill="#E4572E"/><circle cx="32" cy="6" r="2.2" fill="#E4572E"/>`;
      return s;
    }
    case 'hime':
      return `<path d="M21 26 Q21 16.5 32 16.5 Q43 16.5 43 26 L43 23 L21 23 Z" fill="${ink}"/>`
        + `<path d="M20.5 23 L23.5 23 L23.5 36 L20.5 36 Z M40.5 23 L43.5 23 L43.5 36 L40.5 36 Z" fill="${ink}"/>`
        + `<path d="M42 18 l6 -6" stroke="#F2B705" stroke-width="1.4" stroke-linecap="round"/><circle cx="48.5" cy="11.5" r="1.6" fill="#E4572E"/>`;
    case 'hood':
    case 'hood-pink': {
      const c = p.hair === 'hood-pink' ? '#C8507A' : '#2B2F45';
      return `<path d="M19.5 31 Q18 15 32 15 Q46 15 44.5 31 L44.5 42 Q32 46 19.5 42 Z M23.5 26.5 Q32 23.5 40.5 26.5 L40.5 31.5 Q32 33.5 23.5 31.5 Z" fill="${c}" fill-rule="evenodd" stroke="${ink}" stroke-width="1.2"/>`;
    }
    case 'komuso':
      return `<path d="M17 40 Q15 12 32 10 Q49 12 47 40 Q32 44 17 40 Z" fill="#D9B76A" stroke="${ink}" stroke-width="1.3"/>`
        + [16, 21, 26, 31, 36].map((y) => `<path d="M${y < 20 ? 20 : 17} ${y} Q32 ${y - 3} ${y < 20 ? 44 : 47} ${y}" stroke="${ink}" stroke-width="0.6" fill="none"/>`).join('')
        + `<path d="M27 32 h10" stroke="${ink}" stroke-width="1.2"/>`;
    case 'thief': {
      // ほっかむり：唐草の手ぬぐいを頭からかぶり、鼻の下で結ぶ
      const cloth = '#3E8B5A';
      let s = `<path d="M18.5 33 Q17 13.5 32 13.5 Q47 13.5 45.5 33 L44 33 Q42 22 32 22 Q22 22 20 33 Z" fill="${cloth}" stroke="${ink}" stroke-width="1.1"/>`;
      s += `<path d="M21 34 Q32 39.5 43 34 L43 37.5 Q32 43 21 37.5 Z" fill="${cloth}" stroke="${ink}" stroke-width="1"/>`;
      s += `<path d="M29 39 q-4 -1 -5 2 q4 1 5 -2 Z M35 39 q4 -1 5 2 q-4 1 -5 -2 Z" fill="${cloth}" stroke="${ink}" stroke-width="0.8"/><circle cx="32" cy="39.2" r="1.6" fill="${cloth}" stroke="${ink}" stroke-width="0.8"/>`;
      for (const [x, y] of [[24, 18], [32, 16.5], [40, 18], [21, 26], [43, 26], [28, 38.5], [37, 38.5]]) s += `<path d="M${x} ${y} a1.6 1.6 0 1 1 1.6 1.6" stroke="#FBF6EA" stroke-width="0.7" fill="none"/>`;
      return s;
    }
    case 'tengu':
      return `<rect x="29" y="14" width="6" height="4.5" rx="1" fill="${ink}"/>`; // 頭襟（ときん）
    default:
      return '';
  }
}

function edoHeadExtra(p) {
  const ink = EDO_INK;
  if (!p.head) return '';
  if (p.head.startsWith('hachimaki')) {
    const kind = p.head.split('-')[1];
    const fill = { red: '#E4572E', blue: '#2F5DC8', white: '#FBF6EA', dots: '#2F5DC8' }[kind] || '#FBF6EA';
    let s = `<path d="M21 23.5 Q32 19 43 23.5 L43 27 Q32 22.6 21 27 Z" fill="${fill}" stroke="${ink}" stroke-width="1"/><path d="M43 24 l5 -3 l1 3 l-5 2 Z" fill="${fill}" stroke="${ink}" stroke-width="0.8"/>`;
    if (kind === 'dots') s += `<circle cx="27" cy="23.4" r="0.8" fill="#FBF6EA"/><circle cx="32" cy="22.6" r="0.8" fill="#FBF6EA"/><circle cx="37" cy="23.4" r="0.8" fill="#FBF6EA"/>`;
    return s;
  }
  if (p.head === 'kasa') return `<path d="M9 22 Q32 2 55 22 Q32 17 9 22 Z" fill="#E1C27A" stroke="${ink}" stroke-width="1.3"/><path d="M32 8 L32 19 M20 14 L24 19.5 M44 14 L40 19.5" stroke="${ink}" stroke-width="0.6"/>`;
  if (p.head === 'tenugui') return `<path d="M23 19.5 L41 19.5 L39.5 14.5 L24.5 14.5 Z" fill="#FBF6EA" stroke="${ink}" stroke-width="1"/><path d="M27 14.5 v5 M32 14.5 v5 M37 14.5 v5" stroke="#2F5DC8" stroke-width="1.2"/>`;
  return '';
}

// ---------- 表情 ----------
function edoFace(p) {
  const ink = EDO_INK;
  const f = p.sex === 'f';
  if (['komuso', 'hood', 'hood-pink'].includes(p.hair) && p.hair === 'komuso') return '';
  const cheeks = (o = 0.5) => `<circle cx="26.2" cy="33.4" r="1.8" fill="#F2A68F" opacity="${o}"/><circle cx="37.8" cy="33.4" r="1.8" fill="#F2A68F" opacity="${o}"/>`;
  const nose = `<path d="M32.3 30.5 q1.4 3 -0.6 4.2" stroke="${ink}" stroke-width="0.9" fill="none" stroke-linecap="round"/>`;
  const browsM = `<path d="M25 25 l5.5 -1.4 M33.5 23.6 l5.5 1.4" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  const browsF = `<path d="M25.5 24.5 q2.5 -1.2 5 -0.4 M33.5 24.1 q2.5 -0.8 5 0.4" stroke="${ink}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`;
  const brows = f ? browsF : browsM;
  const eyesOpen = `<path d="M25.6 29 q2.6 -1.6 5 -0.2 M33.4 28.8 q2.4 -1.4 5 0.2" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="28.4" cy="28.9" r="0.9" fill="${ink}"/><circle cx="35.8" cy="28.9" r="0.9" fill="${ink}"/>`;
  const eyesSmile = `<path d="M25.6 29.4 q2.5 -2.4 5 0 M33.4 29.4 q2.5 -2.4 5 0" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const mouthLine = `<path d="M29.6 37 q2.4 0.8 4.8 0" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  const mouthLips = `<path d="M30.2 37 q1.8 1 3.6 0 q-1.8 -0.4 -3.6 0 Z" fill="#E4572E"/>`;
  const mouthSmile = `<path d="M29 36.2 q3 3.4 6 0 Z" fill="#B8325A" stroke="${ink}" stroke-width="0.8"/>`;
  switch (p.face) {
    case 'smile':
      return brows + eyesSmile + nose + (f ? mouthLips : mouthSmile) + cheeks(0.7);
    case 'wink':
      return brows + `<path d="M25.6 29 q2.6 -1.6 5 -0.2" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="28.4" cy="28.9" r="0.9" fill="${ink}"/><path d="M33.4 29.4 q2.5 -2.2 5 0" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
        + nose + (f ? mouthLips : `<path d="M29.6 36.6 q2.6 1.8 5 -0.6" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>`) + cheeks(0.6)
        + `<path d="M41 26 l2 -1.2 M41.6 28.4 l2.2 0" stroke="#F2B705" stroke-width="0.9" stroke-linecap="round"/>`;
    case 'sly':
      return brows + `<path d="M25.6 29 q2.6 -1.2 5 0 M33.4 29 q2.4 -1.2 5 0" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="29.6" cy="29.2" r="0.9" fill="${ink}"/><circle cx="37.2" cy="29.2" r="0.9" fill="${ink}"/>`
        + nose + `<path d="M29.6 37.2 q2.6 0.6 4.8 -1" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>` + cheeks(0.4);
    case 'shout':
      return browsM + `<circle cx="28.2" cy="28.8" r="1.6" fill="#FFFFFF" stroke="${ink}" stroke-width="0.9"/><circle cx="35.8" cy="28.8" r="1.6" fill="#FFFFFF" stroke="${ink}" stroke-width="0.9"/><circle cx="28.4" cy="28.9" r="0.7" fill="${ink}"/><circle cx="35.6" cy="28.9" r="0.7" fill="${ink}"/>`
        + nose + `<path d="M28.6 35.6 q3.4 -1 6.8 0 q-0.6 4.4 -3.4 4.4 q-2.8 0 -3.4 -4.4 Z" fill="#B8325A" stroke="${ink}" stroke-width="0.9"/>` + cheeks(0.5);
    case 'drunk':
      return browsM + `<path d="M25.6 28.4 q2.5 2 5 0 M33.4 28.4 q2.5 2 5 0" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
        + `<ellipse cx="32.4" cy="33" rx="2.2" ry="1.8" fill="#E4572E" opacity="0.85"/>` + `<path d="M29 37 q1.5 1.4 3 0 q1.5 1.4 3 0" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>`
        + `<circle cx="25.8" cy="33" r="2.6" fill="#E4572E" opacity="0.45"/><circle cx="38.2" cy="33" r="2.6" fill="#E4572E" opacity="0.45"/>`;
    case 'kabuki':
      // 隈取：目のまわりから跳ね上がる赤い線
      return `<path d="M24 26 Q22 21 19.5 18 M40 26 Q42 21 44.5 18 M24.5 31 Q22 33 21 37 M39.5 31 Q42 33 43 37" stroke="#E4572E" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
        + `<path d="M24.5 25.6 l6 -2.6 M33.5 23 l6 2.6" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`
        + `<path d="M25.4 29.4 q2.7 -2 5.2 0 M33.4 29.4 q2.6 -2 5.2 0" stroke="#E4572E" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.6"/>`
        + `<path d="M25.6 29 q2.6 -1.6 5 -0.2 M33.4 28.8 q2.4 -1.4 5 0.2" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="29.4" cy="28.6" r="1" fill="${ink}"/><circle cx="34.6" cy="28.6" r="1" fill="${ink}"/>`
        + nose + `<path d="M29 37.8 q3 -2 6 0" stroke="#E4572E" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case 'sumo':
      return `<path d="M24 25 l6 -1.2 M34 23.8 l6 1.2" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>` + eyesOpen + nose
        + `<path d="M28.6 37.4 h6.8" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>` + `<circle cx="24.4" cy="34" r="2.4" fill="#F2A68F" opacity="0.6"/><circle cx="39.6" cy="34" r="2.4" fill="#F2A68F" opacity="0.6"/>`;
    case 'old':
      return `<path d="M24 25.6 q3 -2.6 6.4 -0.8 M33.6 24.8 q3.4 -1.8 6.4 0.8" stroke="#FBF6EA" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 25.6 q3 -2.6 6.4 -0.8 M33.6 24.8 q3.4 -1.8 6.4 0.8" stroke="${ink}" stroke-width="0.5" fill="none"/>`
        + eyesSmile + nose + `<path d="M25 36 Q32 52 39 36 Q35.5 38.5 32 37.8 Q28.5 38.5 25 36 Z" fill="#FBF6EA" stroke="${ink}" stroke-width="0.9"/>`
        + `<path d="M27 35.6 q5 -2.4 10 0" stroke="${ink}" stroke-width="0.6" fill="#FBF6EA"/>` + cheeks(0.5);
    case 'oiran':
      return browsF + `<path d="M24.6 28.8 q-1 -0.4 -1.8 0.6 M39.4 28.6 q1 -0.4 1.8 0.6" stroke="#E4572E" stroke-width="1.4" stroke-linecap="round"/>`
        + `<path d="M25.6 29 q2.6 -1.6 5 -0.2 M33.4 28.8 q2.4 -1.4 5 0.2" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="28.6" cy="29" r="0.9" fill="${ink}"/><circle cx="35.6" cy="29" r="0.9" fill="${ink}"/>`
        + nose + `<path d="M29.8 36.8 q2.2 1.6 4.4 0 q-2.2 -0.8 -4.4 0 Z" fill="#D02B3A"/>`
        + `<circle cx="37.6" cy="35.6" r="0.6" fill="${ink}"/>` + cheeks(0.55);
    case 'hyottoko':
      // ひょっとこ：大きさの違う丸い目と、横にとがらせた口
      return `<path d="M24.8 24.6 q3 -2.4 6 0 M34 23.4 q2.4 -1.4 4.8 0.4" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
        + `<circle cx="27.8" cy="28.8" r="2.4" fill="#FFFFFF" stroke="${ink}" stroke-width="1"/><circle cx="28.2" cy="29" r="1" fill="${ink}"/><circle cx="36.2" cy="28.2" r="1.5" fill="#FFFFFF" stroke="${ink}" stroke-width="1"/><circle cx="36.3" cy="28.3" r="0.6" fill="${ink}"/>`
        + nose + `<path d="M33 35.4 q5 -1.6 6.4 1.4 q-1.6 2.6 -6.4 1 Z" fill="#E4572E" stroke="${ink}" stroke-width="1"/><circle cx="38.4" cy="36.8" r="0.9" fill="${ink}"/>`
        + `<circle cx="26" cy="34" r="2.2" fill="#F2A68F" opacity="0.6"/>`;
    case 'okame':
      return `<ellipse cx="27" cy="21.8" rx="1.6" ry="0.9" fill="${ink}"/><ellipse cx="37" cy="21.8" rx="1.6" ry="0.9" fill="${ink}"/>`
        + `<path d="M25 29.4 q2.6 -1.6 5 0 M34 29.4 q2.6 -1.6 5 0" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
        + `<path d="M32 31 q0.8 1.6 -0.4 2.4" stroke="${ink}" stroke-width="0.8" fill="none"/>` + `<path d="M30.6 36.4 q1.4 1 2.8 0 q-1.4 -0.6 -2.8 0 Z" fill="#E4572E"/>`
        + `<circle cx="24.6" cy="33.6" r="3.4" fill="#F2A68F" opacity="0.7"/><circle cx="39.4" cy="33.6" r="3.4" fill="#F2A68F" opacity="0.7"/>`;
    case 'tengu':
      return `<path d="M23.6 25.4 l7 -2.6 M33.4 22.8 l7 2.6" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`
        + `<circle cx="28" cy="28.8" r="1.8" fill="#F2B705" stroke="${ink}" stroke-width="0.9"/><circle cx="36" cy="28.8" r="1.8" fill="#F2B705" stroke="${ink}" stroke-width="0.9"/><circle cx="28" cy="28.8" r="0.7" fill="${ink}"/><circle cx="36" cy="28.8" r="0.7" fill="${ink}"/>`
        + `<path d="M30.4 29.8 Q38 29 50 33.8 Q51 35.4 49.6 36 Q40 35.8 31 34.2 Z" fill="#D8452E" stroke="${ink}" stroke-width="1.1"/>`
        + `<path d="M27.6 38.4 q4.4 -1.6 8.8 0" stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
    case 'fox':
      return ''; // お面は edoMask で上からかぶせる
    default:
      if (p.hair === 'hood' || p.hair === 'hood-pink') {
        return `<path d="M25.6 29 q2.6 -1.6 5 -0.2 M33.4 28.8 q2.4 -1.4 5 0.2" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="28.4" cy="28.9" r="0.9" fill="${ink}"/><circle cx="35.8" cy="28.9" r="0.9" fill="${ink}"/>` + (f ? browsF : '');
      }
      return brows + eyesOpen + nose + (f ? mouthLips : mouthLine) + cheeks(0.5);
  }
}

// 狐のお面（顔の上にかぶせる）
function edoMask(p) {
  if (p.face !== 'fox') return '';
  const ink = EDO_INK;
  return `<path d="M20.5 32 Q19.5 21 24.5 14 L27.5 21 Q32 19.4 36.5 21 L39.5 14 Q44.5 21 43.5 32 Q41 42 32 43 Q23 42 20.5 32 Z" fill="#FFFFFF" stroke="${ink}" stroke-width="1.3"/>`
    + `<path d="M24.5 15.5 L26.5 20.5 M39.5 15.5 L37.5 20.5" stroke="#E4572E" stroke-width="1.2"/>`
    + `<path d="M24 28.6 q3.2 -2.6 6.6 -0.4 M33.4 28.2 q3.4 -2.2 6.6 0.4" stroke="#E4572E" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    + `<path d="M25.4 29 q2.4 -1 4.6 0 M34 29 q2.4 -1 4.6 0" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>`
    + `<path d="M24 23.6 l3 -1 M40 23.6 l-3 -1" stroke="#E4572E" stroke-width="1.2" stroke-linecap="round"/>`
    + `<ellipse cx="32" cy="36.6" rx="1.6" ry="1.1" fill="${ink}"/><path d="M28.6 39.2 q3.4 1.6 6.8 0" stroke="#E4572E" stroke-width="1" fill="none"/>`;
}

// ---------- 持ち物 ----------
function edoProp(p) {
  const ink = EDO_INK;
  const wood = '#8A6A3A';
  switch (p.prop) {
    case 'dango':
      return `<path d="M48 62 L54 38" stroke="${wood}" stroke-width="1.6"/>`
        + [['#F7F0E1', 0], ['#F2A6B8', 6], ['#7DBE7A', 12]].map(([c, d]) => `<circle cx="${52.8 - d * 0.25}" cy="${44 + d}" r="3.6" fill="${c}" stroke="${ink}" stroke-width="1"/>`).join('');
    case 'taiko':
      return `<ellipse cx="49" cy="55" rx="7" ry="6" fill="#B8325A" stroke="${ink}" stroke-width="1.1"/><ellipse cx="49" cy="55" rx="4.6" ry="4" fill="#F7E6D3" stroke="${ink}" stroke-width="0.8"/>`
        + `<path d="M46.4 53.6 a2 2 0 1 1 2.6 2.4 M49.6 52.4 a1.6 1.6 0 1 1 1.4 2.8" stroke="${ink}" stroke-width="0.6" fill="none"/><path d="M40 47 L50 38 M43 49 L54 42" stroke="${wood}" stroke-width="2" stroke-linecap="round"/>`;
    case 'shuriken':
      return `<g transform="translate(50 51) rotate(20)"><path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#C9D3E0" stroke="${ink}" stroke-width="0.9"/><circle r="1.2" fill="${ink}"/></g>`;
    case 'hammer':
      return `<path d="M44 60 L50 44" stroke="${wood}" stroke-width="2.2" stroke-linecap="round"/><rect x="45" y="39" width="11" height="5" rx="1" fill="#9AA6B8" stroke="${ink}" stroke-width="1" transform="rotate(20 50.5 41.5)"/>`;
    case 'fish':
      return `<path d="M38 52 Q46 44 54 50 L58 46 L57 54 L53 52 Q46 58 38 52 Z" fill="#6E8FB8" stroke="${ink}" stroke-width="1"/><circle cx="42" cy="50.6" r="0.9" fill="${ink}"/><path d="M45 49 q2 3 0 5" stroke="${ink}" stroke-width="0.6" fill="none"/>`;
    case 'elekiter':
      return `<rect x="42" y="48" width="11" height="9" rx="1" fill="#C99A3C" stroke="${ink}" stroke-width="1"/><path d="M53 50 h3 v-4" stroke="${ink}" stroke-width="1.2" fill="none"/><circle cx="47.5" cy="52.5" r="2" fill="#E1C27A" stroke="${ink}" stroke-width="0.7"/>`
        + `<path d="M45 47 L43 42 L46 43 L44 37" stroke="#F2B705" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`;
    case 'kiseru':
      return `<path d="M36 40 L54 54" stroke="#C99A3C" stroke-width="1.4" stroke-linecap="round"/><path d="M52.5 52 l3 -1 l0.5 3.5 l-2.5 0.5 Z" fill="#C99A3C" stroke="${ink}" stroke-width="0.6"/>`
        + `<path d="M55 50 q-2 -3 0 -5 q2 -2 0 -5" stroke="#C9D3E0" stroke-width="1" fill="none" stroke-linecap="round"/>`;
    case 'soroban':
      return `<g transform="rotate(-15 48 52)"><rect x="39" y="47" width="17" height="10" rx="1" fill="#8A6A3A" stroke="${ink}" stroke-width="1"/><path d="M39 50 h17" stroke="${ink}" stroke-width="0.8"/>`
        + [42, 45, 48, 51, 54].map((x) => `<circle cx="${x}" cy="48.6" r="0.9" fill="#E1C27A"/><circle cx="${x}" cy="52.6" r="0.9" fill="#E1C27A"/><circle cx="${x}" cy="55" r="0.9" fill="#E1C27A"/>`).join('') + '</g>';
    case 'jitte':
      return `<path d="M42 60 L52 38" stroke="#9AA6B8" stroke-width="2" stroke-linecap="round"/><path d="M47.6 47.6 l4 -1 l0.4 -3" stroke="#9AA6B8" stroke-width="1.4" fill="none"/><path d="M42 60 l-2 3 M42 60 l1 3.4" stroke="#E4572E" stroke-width="1.4"/>`;
    case 'brush':
      return `<path d="M42 58 L52 40" stroke="${wood}" stroke-width="2" stroke-linecap="round"/><path d="M52 40 l3 -5 q0.6 2.4 -1.4 6 Z" fill="${ink}"/><path d="M38 60 q4 -2 8 0" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case 'kite':
      return `<path d="M50 36 L57 44 L50 54 L43 44 Z" fill="#E4572E" stroke="${ink}" stroke-width="1"/><path d="M50 36 V54 M43 44 H57" stroke="${ink}" stroke-width="0.6"/><circle cx="50" cy="44" r="2.2" fill="#F2B705"/><path d="M50 54 q-3 4 0 8" stroke="${ink}" stroke-width="0.7" fill="none"/>`;
    case 'tea':
      return `<path d="M43 50 h10 l-1.4 8 h-7.2 Z" fill="#6E8B3D" stroke="${ink}" stroke-width="1"/><path d="M45 47 q1 -2 0 -4 M49 47 q1 -2 0 -4" stroke="#C9D3E0" stroke-width="0.9" fill="none" stroke-linecap="round"/><path d="M41 58.6 h14" stroke="${wood}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'sword':
      return `<path d="M36 62 L54 44" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M44.5 53.5 l3 3" stroke="#C99A3C" stroke-width="3.4" stroke-linecap="round"/><path d="M47 51 L54 44" stroke="#C9D3E0" stroke-width="1" stroke-dasharray="1.5 1.2"/>`;
    case 'letterbox':
      return `<path d="M38 44 L58 44" stroke="${wood}" stroke-width="1.8" stroke-linecap="round"/><rect x="48" y="45" width="8" height="7" fill="#1F1D24" stroke="${ink}" stroke-width="0.8"/><text x="52" y="50.6" font-size="4.4" text-anchor="middle" fill="#F2B705" font-family="serif">御用</text>`;
    case 'sake':
      return `<path d="M46 40 q-2 4 -3 8 q-2 3 0 8 h8 q2 -5 0 -8 q-1 -4 -3 -8 Z" fill="#FBF6EA" stroke="${ink}" stroke-width="1"/><path d="M44 50 h8" stroke="#2F5DC8" stroke-width="1.6"/><path d="M53 55 h5 l-0.8 3 h-3.4 Z" fill="#E4572E" stroke="${ink}" stroke-width="0.8"/>`;
    case 'goldfish':
      return `<path d="M41 47 Q41 60 49 60 Q57 60 57 47 Z" fill="#BFE0F2" stroke="${ink}" stroke-width="1"/><path d="M40 47 h18" stroke="${ink}" stroke-width="1"/><path d="M46 53 q3 -2.4 5 0 q-2 2.4 -5 0 Z M51 53 l2.4 -1.6 v3.2 Z" fill="#E4572E"/>`;
    case 'soba':
      return `<path d="M41 50 h15 q-1 8 -7.5 8 q-6.5 0 -7.5 -8 Z" fill="#B8325A" stroke="${ink}" stroke-width="1"/><path d="M43 50 q2 -2 4 0 q2 -2 4 0 q2 -2 4 0" stroke="#E1C27A" stroke-width="1" fill="none"/><path d="M47 49 L53 37 M49 49 L56 38" stroke="${wood}" stroke-width="1.1" stroke-linecap="round"/>`;
    case 'furoshiki':
      return `<path d="M40 50 Q38 40 48 39 Q58 40 56 50 Q55 58 48 58 Q41 58 40 50 Z" fill="#3E8B5A" stroke="${ink}" stroke-width="1"/><path d="M45 39 l3 -3 l3 3" fill="#3E8B5A" stroke="${ink}" stroke-width="0.9"/>`
        + [[44, 46], [51, 44], [47, 52], [53, 51]].map(([x, y]) => `<path d="M${x} ${y} a1.8 1.8 0 1 1 1.8 1.8" stroke="#FBF6EA" stroke-width="0.8" fill="none"/>`).join('');
    case 'lantern':
      return `<path d="M49 36 v3" stroke="${ink}" stroke-width="1"/><rect x="45" y="39" width="8" height="2" fill="${ink}"/><ellipse cx="49" cy="48" rx="6" ry="7" fill="#E4572E" stroke="${ink}" stroke-width="1"/><rect x="45" y="54.6" width="8" height="2" fill="${ink}"/>`
        + `<path d="M43.2 45 h11.6 M43.2 51 h11.6" stroke="#FBF6EA" stroke-width="0.6" opacity="0.7"/><circle cx="49" cy="48" r="2" fill="#F2B705" opacity="0.8"/>`;
    case 'koma':
      return `<path d="M42 47 L56 47 L49 58 Z" fill="#F2B705" stroke="${ink}" stroke-width="1"/><path d="M42 47 Q49 43 56 47" fill="#E4572E" stroke="${ink}" stroke-width="1"/><path d="M49 45 v-5" stroke="${wood}" stroke-width="1.6"/><path d="M44.5 49.5 h9 M46.4 52.6 h5.2" stroke="#2F5DC8" stroke-width="1"/>`;
    case 'shakuhachi':
      return `<path d="M40 62 L47 36" stroke="#C99A3C" stroke-width="4" stroke-linecap="round"/><path d="M41 56 l3 1 M43 49 l3 1 M45 42 l3 1" stroke="${ink}" stroke-width="0.8"/>`;
    case 'leaf': // 天狗の羽うちわ
      return `<path d="M46 60 L49 50" stroke="${wood}" stroke-width="1.6"/><path d="M49 50 Q40 46 43 38 Q48 42 49 36 Q52 42 56 38 Q58 46 49 50 Z" fill="#3E8B5A" stroke="${ink}" stroke-width="1"/><path d="M49 50 V39 M49 46 l-4 -4 M49 46 l4 -4" stroke="#2E6B45" stroke-width="0.6"/>`;
    case 'juzu':
      return Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return `<circle cx="${48 + Math.cos(a) * 5}" cy="${52 + Math.sin(a) * 5}" r="1.4" fill="#8A6A3A" stroke="${ink}" stroke-width="0.5"/>`;
      }).join('') + `<path d="M48 57 l-1 4 M48 57 l1 4" stroke="#E4572E" stroke-width="1.2"/>`;
    case 'fue':
      return `<path d="M36 46 L57 38" stroke="#C99A3C" stroke-width="2.6" stroke-linecap="round"/><path d="M40 44.4 l0 0.1 M44 43 l0 0.1 M48 41.4 l0 0.1 M52 40 l0 0.1" stroke="${ink}" stroke-width="1.4" stroke-linecap="round"/><path d="M53 40 q2 3 5 2" stroke="#E4572E" stroke-width="1" fill="none"/>`;
    case 'bachi':
      return `<path d="M48 54 L46 44" stroke="${wood}" stroke-width="2.6" stroke-linecap="round"/><path d="M41.5 43 L50.5 41 L49.5 47 L44 48 Z" fill="#F7F0E1" stroke="${ink}" stroke-width="1"/>`;
    case 'furin':
      return `<path d="M50 30 L50 37" stroke="${ink}" stroke-width="0.8"/><path d="M44.5 44 Q44.5 37 50 37 Q55.5 37 55.5 44 Z" fill="#BFE0F2" stroke="${ink}" stroke-width="1"/><path d="M50 44 L50 49" stroke="${ink}" stroke-width="0.8"/><rect x="47.5" y="49" width="5" height="8" fill="#E4572E" stroke="${ink}" stroke-width="0.7"/>`;
    case 'koto':
      return `<g transform="rotate(-25 48 52)"><rect x="36" y="49" width="24" height="7" rx="2" fill="#C99A3C" stroke="${ink}" stroke-width="1"/><path d="M37 51 h22 M37 53 h22 M37 55 h22" stroke="#FBF6EA" stroke-width="0.4"/><path d="M42 49.4 l1.4 -2 l1.4 2 M48 49.4 l1.4 -2 l1.4 2 M54 49.4 l1.4 -2 l1.4 2" stroke="#FBF6EA" stroke-width="0.9" fill="none"/></g>`;
    case 'flowers':
      return `<path d="M46 60 L48 46 M48 60 L52 47 M50 60 L44 48" stroke="#3E8B5A" stroke-width="1.2"/>`
        + [[48, 45, '#E4572E'], [52.4, 46.4, '#F2B705'], [43.6, 47.4, '#F2A6B8']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="${c}" stroke="${ink}" stroke-width="0.7"/><circle cx="${x}" cy="${y}" r="0.9" fill="#FBF6EA"/>`).join('');
    case 'uchiwa':
      return `<path d="M47 62 L48 53" stroke="${wood}" stroke-width="1.6"/><circle cx="48.6" cy="46" r="7.4" fill="#FBF6EA" stroke="${ink}" stroke-width="1"/><circle cx="48.6" cy="46" r="4" fill="#E4572E"/><path d="M45 50 q3.6 -2 7.2 0" stroke="#2F5DC8" stroke-width="1.2" fill="none"/>`;
    case 'spool':
      return `<rect x="43" y="44" width="10" height="2" fill="${wood}"/><rect x="43" y="56" width="10" height="2" fill="${wood}"/><rect x="44.5" y="46" width="7" height="10" fill="#E4572E" stroke="${ink}" stroke-width="0.8"/>`
        + `<path d="M44.5 48 h7 M44.5 50 h7 M44.5 52 h7 M44.5 54 h7" stroke="#B8325A" stroke-width="0.5"/><path d="M51.5 50 q4 2 2 8" stroke="#E4572E" stroke-width="0.8" fill="none"/>`;
    case 'umbrella':
      return `<path d="M50 40 L46 62" stroke="${wood}" stroke-width="1.4"/><path d="M36 44 Q48 30 62 42 Q49 40 36 44 Z" fill="#E4572E" stroke="${ink}" stroke-width="1"/><path d="M49 36.5 L42 43 M49 36.5 L49 41 M49 36.5 L56 41.5" stroke="#FBF6EA" stroke-width="0.6"/>`;
    case 'crane':
      return `<path d="M40 50 L49 46 L58 50 L50 52 Z" fill="#E4572E" stroke="${ink}" stroke-width="0.9"/><path d="M49 46 L46 38 L49 44 Z M49 46 L53 40 L51 45 Z" fill="#FBF6EA" stroke="${ink}" stroke-width="0.8"/><path d="M40 50 l-2 -6 l3 1" fill="none" stroke="${ink}" stroke-width="0.9"/>`;
    case 'shogi':
      return `<path d="M48 38 L54 41 L56 56 L40 56 L42 41 Z" fill="#E1C27A" stroke="${ink}" stroke-width="1"/><text x="48" y="51.5" font-size="8" text-anchor="middle" fill="${ink}" font-family="serif">王</text>`;
    case 'plum':
      return `<path d="M38 60 Q46 52 48 44 M46 50 L54 46" stroke="#5B3A29" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        + [[48, 43], [54, 45.4], [43, 53]].map(([x, y]) => Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2;
          return `<circle cx="${x + Math.cos(a) * 1.7}" cy="${y + Math.sin(a) * 1.7}" r="1.4" fill="#F2A6B8"/>`;
        }).join('') + `<circle cx="${x}" cy="${y}" r="0.8" fill="#E4572E"/>`).join('');
    case 'onigiri':
      return `<path d="M48 41 Q56 50 54 56 Q48 59 42 56 Q40 50 48 41 Z" fill="#FFFFFF" stroke="${ink}" stroke-width="1"/><rect x="44.6" y="51" width="6.8" height="6" fill="${ink}"/>`;
    case 'kunai':
      return `<path d="M44 58 L52 42 L50 50 Z" fill="#9AA6B8" stroke="${ink}" stroke-width="0.9"/><path d="M44 58 l-2 4" stroke="#E4572E" stroke-width="1.6"/><circle cx="41.4" cy="63" r="1.2" fill="none" stroke="${ink}" stroke-width="0.8"/>`;
    case 'fan':
      return `<path d="M47 60 L39 45 A17 17 0 0 1 58 44 Z" fill="#F2B705" stroke="${ink}" stroke-width="1"/><path d="M47 60 L43 44.5 M47 60 L48 43 M47 60 L53 43.5" stroke="${ink}" stroke-width="0.6"/><circle cx="49" cy="48" r="2.4" fill="#E4572E"/>`;
    case 'mirror':
      return `<path d="M45 62 L47 53" stroke="#5B3A29" stroke-width="2" stroke-linecap="round"/><circle cx="48.6" cy="46.6" r="6.4" fill="#C99A3C" stroke="${ink}" stroke-width="1"/><circle cx="48.6" cy="46.6" r="4.6" fill="#E3ECF2"/><path d="M46.4 44.6 l2 -1.6" stroke="#FFFFFF" stroke-width="1"/>`;
    case 'sparkler':
      return `<path d="M44 62 L50 46" stroke="#5B3A29" stroke-width="1"/>` + Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return `<path d="M${50 + Math.cos(a) * 1.5} ${46 + Math.sin(a) * 1.5} L${50 + Math.cos(a) * 5} ${46 + Math.sin(a) * 5}" stroke="#F2B705" stroke-width="1" stroke-linecap="round"/>`;
      }).join('') + `<circle cx="50" cy="46" r="1.4" fill="#E4572E"/>`;
    case 'shamoji':
      return `<path d="M45 61 L48.5 50" stroke="#E1C27A" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="50" cy="45" rx="4.4" ry="6" fill="#E1C27A" stroke="${ink}" stroke-width="1" transform="rotate(18 50 45)"/>`;
    case 'bamboo':
      return `<path d="M50 64 L50 38" stroke="#3E8B5A" stroke-width="4"/><path d="M48 46 h4 M48 55 h4" stroke="#2E6B45" stroke-width="1"/><path d="M50 40 q5 -2 7 -6 M50 50 q-5 -2 -7 -6" stroke="#3E8B5A" stroke-width="1.4" fill="none"/>`;
    case 'matoi':
      return `<path d="M52 64 L52 36" stroke="${wood}" stroke-width="2"/><rect x="47" y="30" width="10" height="7" rx="1" fill="#FBF6EA" stroke="${ink}" stroke-width="1"/><path d="M47 37 l1 8 M50 37 l0 9 M53 37 l0 9 M56 37 l-1 8" stroke="${ink}" stroke-width="1.2"/>`;
    case 'rice':
      return `<path d="M46 64 Q44 52 49 41" stroke="#6E8B3D" stroke-width="1.8" fill="none"/>`
        + [0, 1, 2, 3, 4].map((i) => `<ellipse cx="${48.6 + i * 0.7}" cy="${42 + i * 3.2}" rx="1.9" ry="2.6" fill="#E1C27A" stroke="${ink}" stroke-width="0.6"/>`).join('');
    default:
      return '';
  }
}
