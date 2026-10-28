// src/maps/data.js を Blender 生成スクリプト用の JSON に書き出す
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/maps/data.js';

const out = process.argv[2] || 'tools/blender/maps.json';
writeFileSync(out, JSON.stringify(MAPS, null, 1));
console.log(`wrote ${out} (${Object.keys(MAPS).length} maps)`);
