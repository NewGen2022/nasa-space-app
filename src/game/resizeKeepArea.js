import Phaser from 'phaser';

// Перемалювати будинок під нові w,h і оновити зони/лейбли
export function applyHouseSize(container, wTiles, hTiles, TILE_PX) {
    const W = wTiles * TILE_PX;
    const H = hTiles * TILE_PX;

    container.setSize(W, H);

    const g = container.getByName('gfx');
    const door = container.getByName('door');
    const winL = container.getByName('winL');
    const winR = container.getByName('winR');
    const nameT = container.getByName('labelName');
    const pplT = container.getByName('labelHumans');
    const hit = container.getByName('hit'); // зона drag усього дому

    g.clear();
    // підлога
    g.fillStyle(0x2b2f38, 0.9).fillRect(0, 0, W, H);
    // внутрішня сітка
    g.lineStyle(1, 0xffffff, 0.08);
    for (let x = TILE_PX; x < W; x += TILE_PX) g.lineBetween(x, 0, x, H);
    for (let y = TILE_PX; y < H; y += TILE_PX) g.lineBetween(0, y, W, y);
    // стіни
    g.lineStyle(2, 0x8fe3ff, 1).strokeRect(1, 1, W - 2, H - 2);

    // двері/вікна
    door.setPosition(W / 2, H - 1);
    winL.setPosition(2, H / 2);
    winR.setPosition(W - 2, H / 2);

    // лейбли
    if (nameT) nameT.setPosition(4, 4);
    if (pplT) pplT.setPosition(W - 4, 20).setOrigin(1, 0);

    // ГОЛОВНЕ: тягнуча зона під увесь новий розмір
    if (hit) hit.setSize(W, H).setPosition(0, 0);
}

// Ресайз: не даємо перевищити площу-максимум, обмежуємо межами світу, снапаєм до сітки
export function enableResizeKeepArea(
    scene,
    container,
    TILE_PX,
    worldRect,
    gridAPI
) {
    const model = container.getData('model'); // { w, h, areaTiles }
    const AREA_MAX = Math.max(1, Number(model.areaTiles | 0)); // дозволена макс. площа (у тайлах)
    const MIN_SIDE = 3;

    // Створюємо 4 ручки (зони)
    const handles = {
        left: scene.add
            .zone(0, 0, 12, container.height)
            .setOrigin(0, 0)
            .setName('hdlL'),
        right: scene.add
            .zone(container.width - 12, 0, 12, container.height)
            .setOrigin(0, 0)
            .setName('hdlR'),
        top: scene.add
            .zone(0, 0, container.width, 12)
            .setOrigin(0, 0)
            .setName('hdlT'),
        bottom: scene.add
            .zone(0, container.height - 12, container.width, 12)
            .setOrigin(0, 0)
            .setName('hdlB'),
    };
    Object.values(handles).forEach((h) => {
        h.setInteractive({ cursor: 'ew-resize' });
        scene.input.setDraggable(h);
    });
    handles.top.input.cursor = handles.bottom.input.cursor = 'ns-resize';
    container.add([handles.left, handles.right, handles.top, handles.bottom]);

    const applyLayoutToHandles = () => {
        handles.left.setSize(12, container.height).setPosition(0, 0);
        handles.right
            .setSize(12, container.height)
            .setPosition(container.width - 12, 0);
        handles.top.setSize(container.width, 12).setPosition(0, 0);
        handles.bottom
            .setSize(container.width, 12)
            .setPosition(0, container.height - 12);
    };

    const snapPxToTile = (px) => Math.round(px / TILE_PX) * TILE_PX;

    // Підбір розмірів під таргетовану ширину/висоту з обмеженням: w*h ≤ AREA_MAX
    const chooseByTargetW = (targetWTiles) => {
        // межі світу для ширини (в тайлах)
        const maxWWorld = Math.floor(worldRect.width / TILE_PX);
        // обмежуємо бажання користувача
        let w = Phaser.Math.Clamp(
            Math.round(targetWTiles),
            MIN_SIDE,
            Math.min(maxWWorld, AREA_MAX)
        );
        // висота за максимумом площі
        let h = Math.floor(AREA_MAX / w);
        if (h < MIN_SIDE) {
            // якщо навіть мін. висота не проходить — стискаємо ширину
            w = Math.max(MIN_SIDE, Math.floor(AREA_MAX / MIN_SIDE));
            h = Math.floor(AREA_MAX / w);
        }
        // обмежимо ще й по висоті світу
        const maxHWorld = Math.floor(worldRect.height / TILE_PX);
        if (h > maxHWorld) h = maxHWorld;
        // гарантії
        w = Math.max(MIN_SIDE, Math.floor(w));
        h = Math.max(MIN_SIDE, Math.floor(h));
        // не перевищити площу
        while (w * h > AREA_MAX && h > MIN_SIDE) h--;
        while (w * h > AREA_MAX && w > MIN_SIDE) w--;
        // і навпаки: спробуємо добратися ближче до максимуму площі
        while (w * (h + 1) <= AREA_MAX && h + 1 <= maxHWorld) h++;
        return { w, h };
    };

    const chooseByTargetH = (targetHTiles) => {
        const maxHWorld = Math.floor(worldRect.height / TILE_PX);
        let h = Phaser.Math.Clamp(
            Math.round(targetHTiles),
            MIN_SIDE,
            Math.min(maxHWorld, AREA_MAX)
        );
        let w = Math.floor(AREA_MAX / h);
        if (w < MIN_SIDE) {
            h = Math.max(MIN_SIDE, Math.floor(AREA_MAX / MIN_SIDE));
            w = Math.floor(AREA_MAX / h);
        }
        const maxWWorld = Math.floor(worldRect.width / TILE_PX);
        if (w > maxWWorld) w = maxWWorld;

        h = Math.max(MIN_SIDE, Math.floor(h));
        w = Math.max(MIN_SIDE, Math.floor(w));
        while (w * h > AREA_MAX && w > MIN_SIDE) w--;
        while (w * h > AREA_MAX && h > MIN_SIDE) h--;
        while ((w + 1) * h <= AREA_MAX && w + 1 <= maxWWorld) w++;
        return { w, h };
    };

    // Горизонтальний ресайз
    const resizeHorizontal = (draggedLeft, pointer) => {
        const leftX = container.x;
        const rightX = container.x + container.width;

        const newEdge = snapPxToTile(pointer.worldX);
        let newLeft = draggedLeft ? newEdge : leftX;
        let newRight = draggedLeft ? rightX : newEdge;

        const proposedWpx = Math.max(MIN_SIDE * TILE_PX, newRight - newLeft);
        const targetWTiles = proposedWpx / TILE_PX;

        const pick = chooseByTargetW(targetWTiles);
        const newW = pick.w,
            newH = pick.h;
        const newWpx = newW * TILE_PX;
        const newHpx = newH * TILE_PX;

        if (draggedLeft) newLeft = rightX - newWpx;

        const clampedLeft = Phaser.Math.Clamp(
            newLeft,
            worldRect.x,
            worldRect.width - newWpx
        );
        const clampedTop = Phaser.Math.Clamp(
            container.y,
            worldRect.y,
            worldRect.height - newHpx
        );

        const nOx = Math.round(clampedLeft / TILE_PX);
        const nOy = Math.round(clampedTop / TILE_PX);
        const freeRect = gridAPI.rectFree(nOx, nOy, newW, newH);
        const terrainOk = gridAPI.terrainOK
            ? gridAPI.terrainOK(nOx, nOy, newW, newH)
            : true;
        const free = freeRect && terrainOk;

        // прев’ю лишається
        applyHouseSize(container, newW, newH, TILE_PX);
        container.setPosition(clampedLeft, clampedTop);
        applyLayoutToHandles();

        return {
            ok: free,
            nOx,
            nOy,
            newW,
            newH,
            reason: !terrainOk ? 'terrain' : !freeRect ? 'occupied' : 'ok',
        };
    };

    // Вертикальний ресайз
    const resizeVertical = (draggedTop, pointer) => {
        const topY = container.y;
        const bottomY = container.y + container.height;

        const newEdge = snapPxToTile(pointer.worldY);
        let newTop = draggedTop ? newEdge : topY;
        let newBottom = draggedTop ? bottomY : newEdge;

        const proposedHpx = Math.max(MIN_SIDE * TILE_PX, newBottom - newTop);
        const targetHTiles = proposedHpx / TILE_PX;

        const pick = chooseByTargetH(targetHTiles);
        const newH = pick.h,
            newW = pick.w;
        const newHpx = newH * TILE_PX;
        const newWpx = newW * TILE_PX;

        if (draggedTop) newTop = bottomY - newHpx;

        const clampedTop = Phaser.Math.Clamp(
            newTop,
            worldRect.y,
            worldRect.height - newHpx
        );
        const clampedLeft = Phaser.Math.Clamp(
            container.x,
            worldRect.x,
            worldRect.width - newWpx
        );

        const nOx = Math.round(clampedLeft / TILE_PX);
        const nOy = Math.round(clampedTop / TILE_PX);
        const freeRect = gridAPI.rectFree(nOx, nOy, newW, newH);
        const terrainOk = gridAPI.terrainOK
            ? gridAPI.terrainOK(nOx, nOy, newW, newH)
            : true;
        const free = freeRect && terrainOk;

        applyHouseSize(container, newW, newH, TILE_PX);
        container.setPosition(clampedLeft, clampedTop);
        applyLayoutToHandles();

        return {
            ok: free,
            nOx,
            nOy,
            newW,
            newH,
            reason: !terrainOk ? 'terrain' : !freeRect ? 'occupied' : 'ok',
        };
    };

    // Підписки
    let preview;
    const start = () => {
        const { ox, oy } = container.getData('origin');
        gridAPI.markRect(ox, oy, model.w, model.h, 0);
        container.setDepth(1000);
        container.setAlpha(0.95);
    };
    const end = (result) => {
        container.setAlpha(1);
        container.setDepth(200);

        if (result?.ok) {
            const { nOx, nOy, newW, newH } = result;
            container.setData('origin', { ox: nOx, oy: nOy });
            Object.assign(model, { w: newW, h: newH }); // фактичний розмір ≤ AREA_MAX
            gridAPI.markRect(nOx, nOy, newW, newH, 1);
            scene._updateIssues?.();
        } else {
            const { ox, oy } = container.getData('origin');
            applyHouseSize(container, model.w, model.h, TILE_PX);
            container.setPosition(ox * TILE_PX, oy * TILE_PX);
            applyLayoutToHandles();
            gridAPI.markRect(ox, oy, model.w, model.h, 1);

            if (result?.reason === 'terrain') {
                alert(
                    'Неможливо змінити розмір: надто великий перепад висот під будинком.'
                );
            }

            scene.tweens.add({
                targets: container,
                duration: 140,
                alpha: 0.6,
                yoyo: true,
                repeat: 1,
            });
            scene._updateIssues?.();
        }
    };

    handles.left.on('dragstart', start);
    handles.right.on('dragstart', start);
    handles.top.on('dragstart', start);
    handles.bottom.on('dragstart', start);

    // ВАЖЛИВО: сигнатура 'drag' => (pointer, dragX, dragY)
    handles.left.on('drag', (pointer /*,dx,dy*/) => {
        preview = resizeHorizontal(true, pointer);
    });
    handles.right.on('drag', (pointer /*,dx,dy*/) => {
        preview = resizeHorizontal(false, pointer);
    });
    handles.top.on('drag', (pointer /*,dx,dy*/) => {
        preview = resizeVertical(true, pointer);
    });
    handles.bottom.on('drag', (pointer /*,dx,dy*/) => {
        preview = resizeVertical(false, pointer);
    });

    handles.left.on('dragend', () => end(preview));
    handles.right.on('dragend', () => end(preview));
    handles.top.on('dragend', () => end(preview));
    handles.bottom.on('dragend', () => end(preview));
}
