// 持ち帰りアイテムのカタログ（じぶんのへやの棚に飾られる）
export const ITEMS = {
  kinoko:       { name: 'きのこ',             color: '#c8553d' },
  ringo:        { name: 'りんご',             color: '#e23b3b' },
  ninjin:       { name: 'にんじん',           color: '#f08a24' },
  kabocha:      { name: 'かぼちゃ',           color: '#e9a23b' },
  ichigo:       { name: 'いちご',             color: '#ff4d6d' },
  daikon:       { name: 'だいこん',           color: '#f4f4ee' },
  hana:         { name: 'おはな',             color: '#ff9ad5' },
  kireinaishi:  { name: 'きれいないし',       color: '#9ad7ff' },
  caterpieLeaf: { name: 'キャタピーのはっぱ', color: '#6cc04a' },
  coilBolt:     { name: 'コイルのネジ',       color: '#b9c1c9' },
  nyoromoShell: { name: 'みずうみのかいがら', color: '#7fb7ff' },
  nazoLeaf:     { name: 'ナゾノクサのは',     color: '#3f9b4f' },
  suikaPiece:   { name: 'スイカのかけら',     color: '#ff5a5a' },
  treasureCoin: { name: 'かいぞくのコイン',   color: '#ffd700' },
  kaigara:      { name: 'さくらがい',         color: '#ffc4d6' },
  campPhoto:    { name: 'キャンプのしゃしん', color: '#fff1c1' },
  mysteryStone: { name: 'ふしぎないし',       color: '#9b5de5' },
  koiking:      { name: 'コイキング',         color: '#ff7b3a' },
  tosakinto:    { name: 'トサキント',         color: '#ffffff' },
  nyoromoFish:  { name: 'ニョロモ',           color: '#5b8cff' },
  hasubrero:    { name: 'ハスボー',           color: '#61c26b' },
  harysen:      { name: 'ハリーセン',         color: '#4b6c8c' },
  menokurage:   { name: 'メノクラゲ',         color: '#5fc8ff' },
  sunnygo:      { name: 'サニーゴ',           color: '#ff92b2' },
  nuoh:         { name: 'ヌオー',             color: '#5aa5d6' },
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}
