// マップ定義の gimmick 名 → セットアップ関数
// 各関数は (world, map) を受け取り { update(dt), enter(), dispose() } を返す（すべて任意）
import room from './room.js';
import garden from './garden.js';
import caterpie from './caterpie.js';
import cooking from './cooking.js';
import fishing from './fishing.js';
import nyoromo from './nyoromo.js';
import nazonokusa from './nazonokusa.js';
import watermelon from './watermelon.js';
import treasure from './treasure.js';
import camp from './camp.js';
import akichi from './akichi.js';

export const GIMMICKS = { room, garden, caterpie, cooking, fishing, nyoromo, nazonokusa, watermelon, treasure, camp, akichi };
