// Константа: 1 тайл = 1 м² (можеш винести у форму)
export const TILE_PX = 32;

export function areaPerHabitat(cfg) {
    // A_perHab = ceil(area_per_person * crew / habitats)
    return Math.ceil(
        (cfg.area * cfg.crewSize) / Math.max(1, cfg.overallHabitats)
    );
}

// Підібрати прямокутник ~ під N тайлів (допуск 10%)
export function bestRectForArea(N) {
    const ratios = [1, 4 / 3, 3 / 2, 2, 5 / 2, 3];
    const cand = [];
    for (const r of ratios) {
        let w = Math.max(3, Math.round(Math.sqrt(N * r)));
        let h = Math.max(3, Math.round(N / w));
        const S = w * h,
            err = Math.abs(S - N) / N;
        if (err <= 0.1) cand.push({ w, h, perim: 2 * (w + h) });
    }
    return (
        cand.sort((a, b) => a.perim - b.perim)[0] || {
            w: Math.ceil(Math.sqrt(N)),
            h: Math.ceil(Math.sqrt(N)),
        }
    );
}

// Сітка розкладки модулів
export function gridLayout(total, w, h, gap = 1, margin = 2) {
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    const mapW = cols * (w + gap) - gap + 2 * margin;
    const mapH = rows * (h + gap) - gap + 2 * margin;

    const positions = [];
    let i = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (i++ >= total) break;
            positions.push({
                ox: margin + c * (w + gap),
                oy: margin + r * (h + gap),
            });
        }
    }
    return { positions, mapW, mapH };
}
