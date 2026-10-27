// マップ定義の整合性チェック（CI で実行）
// - 必須マップがすべて存在するか
// - 出口の行き先 / コース / spawn 名が正しいか
// - ギミック名が実装に存在するか
import { MAPS, COURSES, MAP_LOCKS } from '../src/maps/data.js';
import { readdirSync } from 'node:fs';

const REQUIRED = [
  'room', 'garden', 'tokiwa', 'akaneForest', 'akaneTsuriba', 'asagiLake', 'asagiTsuriba',
  'moegi', 'suoBeach', 'suoIsland', 'suoTsuriba', 'camp', 'akichi',
];
const gimmickFiles = new Set(
  readdirSync(new URL('../src/gimmicks/', import.meta.url)).map((f) => f.replace(/\.js$/, '')),
);

const errors = [];
for (const id of REQUIRED) if (!MAPS[id]) errors.push(`必須マップがありません: ${id}`);

for (const [id, m] of Object.entries(MAPS)) {
  if (!m.spawns?.default) errors.push(`${id}: spawns.default がありません`);
  if (m.gimmick && !gimmickFiles.has(m.gimmick)) errors.push(`${id}: ギミック ${m.gimmick} が未実装`);
  if (/tsuriba/i.test(id) && !(m.fishTable?.length && m.points?.pier && m.points?.bobber)) errors.push(`${id}: つりば設定が不足`);
  for (const ex of m.exits) {
    if (ex.course && !COURSES[ex.course]) errors.push(`${id}: 不明なコース ${ex.course}`);
    if (ex.to && !MAPS[ex.to]) errors.push(`${id}: 不明な行き先 ${ex.to}`);
    if (ex.to && ex.spawn && !MAPS[ex.to].spawns[ex.spawn]) errors.push(`${id}: ${ex.to} に spawn ${ex.spawn} がありません`);
    const [sx, sz] = m.size;
    if (Math.abs(ex.at[0]) > sx || Math.abs(ex.at[1]) > sz) errors.push(`${id}: 出口 ${ex.label} がマップ外`);
  }
}
for (const [cid, c] of Object.entries(COURSES)) for (const mid of c.maps) if (!MAPS[mid]) errors.push(`コース ${cid}: 不明なマップ ${mid}`);
for (const mid of Object.keys(MAP_LOCKS)) if (!MAPS[mid]) errors.push(`MAP_LOCKS: 不明なマップ ${mid}`);

// すべてのマップがホームから到達可能か（ロック無視）
const seen = new Set(['room']);
const queue = ['room'];
while (queue.length) {
  const m = MAPS[queue.shift()];
  const next = m.exits.flatMap((e) => (e.course ? COURSES[e.course].maps : [e.to]));
  for (const n of next) if (MAPS[n] && !seen.has(n)) seen.add(n) && queue.push(n);
}
for (const id of Object.keys(MAPS)) if (!seen.has(id)) errors.push(`${id}: ホームから到達できません`);

if (errors.length) {
  console.error('マップ定義エラー:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`OK: ${Object.keys(MAPS).length} マップ / ${Object.keys(COURSES).length} コース を検証しました`);
