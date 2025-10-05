// src/game/terrain.js

// створити heightmap на весь світ (у тайлах)
export function makeHeightMap(wTiles, hTiles, init = 0) {
    const m = new Array(hTiles);
    for (let y = 0; y < hTiles; y++) {
        m[y] = new Array(wTiles).fill(init);
    }
    return m;
}

// фарбування однієї клітинки (у тайлових координатах)
export function paintHeight(map, tx, ty, value, minH, maxH) {
    if (!map[ty] || map[ty][tx] === undefined) return false;
    const v = Math.max(minH, Math.min(maxH, Math.round(value)));
    map[ty][tx] = v;
    return true;
}

// обчислити перепад у прямокутнику (ox,oy,w,h) у тайлах
export function rectSlope(map, ox, oy, w, h) {
    let min = Infinity,
        max = -Infinity;
    for (let y = oy; y < oy + h; y++) {
        const row = map[y];
        if (!row) continue;
        for (let x = ox; x < ox + w; x++) {
            const v = row[x];
            if (v === undefined) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    if (min === Infinity) return 0;
    return max - min;
}

// просте кодування кольору за висотою
export function heightToColor(h, minH, maxH) {
    const t = (h - minH) / Math.max(1, maxH - minH);
    // від темно-коричневого до світло-піскового
    const r = Math.round(60 + 140 * t);
    const g = Math.round(35 + 110 * t);
    const b = Math.round(30 + 80 * t);
    return (r << 16) | (g << 8) | b;
}
