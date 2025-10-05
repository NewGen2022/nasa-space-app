// Повноекранна сітка, що завжди займає весь екран і вирівнюється по світовій сітці
export function drawScreenGrid(scene, tile) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(4); // HUD-шар

    const redraw = () => {
        g.clear();
        g.lineStyle(1, 0xffffff, 0.15); // напівпрозора
        const cam = scene.cameras.main;
        const w = cam.width,
            h = cam.height;

        // зсув ліній, щоб вони співпадали зі світовою сіткою під камерою
        const offX = -cam.scrollX % tile;
        const offY = -cam.scrollY % tile;

        for (let x = offX; x < w; x += tile) g.lineBetween(x, 0, x, h);
        for (let y = offY; y < h; y += tile) g.lineBetween(0, y, w, y);
    };

    // оновлюємо при скролі/зміні розміру
    scene.events.on('update', redraw);
    scene.scale.on('resize', redraw, scene);
    redraw();
    return g;
}
