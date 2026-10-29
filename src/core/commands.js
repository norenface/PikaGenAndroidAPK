// ピカチュウへの指示ことば（指示はすべて声＝音声認識で行う。画面のヒントは表示だけ）。
// 認識結果はひらがなにそろえてから判定する（カタカナ・漢字の表記ゆれを吸収）。

export const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const normalize = (raw) => toHiragana(raw.replace(/\s+/g, ''));

// 作業の指示（ねらった物に対して使う）。hints があれば画面のヒントにはそのことばを全部出す
export const VERBS = {
  dig: { label: 'ほって', re: /ほって|ほれ|ほる|掘/ },
  harvest: { label: 'ぬいて', re: /ぬいて|抜い|しゅうかく|収穫/ },
  take: { label: 'とって', re: /とって|取って|ひろって|拾って|もってきて|持ってきて/ },
  give: { label: 'わたして', re: /わたして|渡して|あげて/ },
  water: { label: 'みずをやって', re: /みず|水/ },
  plant: { label: 'うえて', re: /うえて|植えて|まいて|蒔いて|たね|種/ },
  look: { label: 'しらべて', re: /しらべ|調べ|さがして|探して|みて|見て|のぞいて|覗いて/ },
  bring: { label: 'つれてきて', re: /つれて|連れて|よんで|呼んで|もどして|戻して/ },
  open: { label: 'あけて', re: /あけて|開けて/ },
  fish: { label: 'つって', re: /つって|釣って|つり|釣り/ },
  pull: { label: 'ひっぱれ', re: /ひっぱれ|引っ張れ|ひっぱって|引っ張って|ひっぱる|引っ張る|ひいて|引いて|ひけ|引け|いまだ|今だ/ },
  cheer: { label: 'がんばれ', re: /がんばれ|頑張れ|がんばって|頑張って|ふぁいと|ふれー/ },
  lunch: { label: 'おべんとう', hints: ['おひる', 'おべんとう', 'ランチ'], re: /おひる|お昼|ひるごはん|昼ごはん|昼ご飯|べんとう|弁当|らんち/ },
  smash: { label: 'わって', hints: ['わって', 'たたいて', 'そこ'], re: /わって|割って|われ|割れ|たたいて|叩いて|たたけ|叩け|そこ|えい/ },
  right: { label: 'みぎ', re: /みぎ|右/ },
  left: { label: 'ひだり', re: /ひだり|左/ },
  front: { label: 'まえ', re: /まえ|前/ },
  back: { label: 'うしろ', re: /うしろ|後ろ/ },
  dance: { label: 'おどって', re: /おどって|踊って|おどろう|踊ろう|だんす/ },
};

// ピカチュウとのふれあいのことば（ねらいに関係なく使える）
export const SOCIAL = {
  call: { label: 'ピカチュウ！', re: /ぴか|びか|ぴっか|pika/i },
  praise: { label: 'いいこだね', re: /いいこ|いい子|良い子|かわい|可愛|すき|好き|えらい|偉い/ },
  come: { label: 'こっちおいで', re: /おいで|こっち|来て|きて/ },
  sleep: { label: 'おやすみ', re: /おやすみ|お休み|ねんね|寝/ },
  zap: { label: '10まんボルト', re: /でんき|電気|10まん|10万|十万|じゅうまん|ぼると/ },
};

// 見つかった作業の指示（先に書いたものほど優先）。なければ null
export function findVerb(text, allowed = Object.keys(VERBS)) {
  return allowed.find((v) => VERBS[v].re.test(text)) ?? null;
}

export function findSocial(text) {
  return Object.keys(SOCIAL).find((k) => SOCIAL[k].re.test(text)) ?? null;
}

// ピカチュウが知っていることばが入っているか（BGMや雑音の誤認識には反応しない）
export function understands(raw) {
  const t = normalize(raw);
  return !!(findVerb(t) || findSocial(t));
}
