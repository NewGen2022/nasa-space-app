export function makeGrid(wTiles, hTiles) {
    return Array.from({ length: hTiles }, () => Array(wTiles).fill(0));
}

export function rectFree(grid, ox, oy, w, h) {
    if (ox < 0 || oy < 0 || oy + h > grid.length || ox + w > grid[0].length)
        return false;
    for (let y = oy; y < oy + h; y++)
        for (let x = ox; x < ox + w; x++) if (grid[y][x]) return false;
    return true;
}

export function markRect(grid, ox, oy, w, h, val) {
    for (let y = oy; y < oy + h; y++)
        for (let x = ox; x < ox + w; x++) grid[y][x] = val;
}
