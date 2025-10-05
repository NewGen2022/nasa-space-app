import Phaser from 'phaser';

export function enableDragSnap(scene, container, tile, worldRect, onDropTry) {
    // знаходимо hit-zone, додану в будинку
    const hit = container.getByName('hit');
    if (!hit) throw new Error('Hit zone not found in house container');

    // інтерактивність і курсори
    hit.setInteractive({ cursor: 'grab' });
    scene.input.setDraggable(hit);

    // зберігаємо стартову тайлову позицію (для відкату)
    container.setData('origin', {
        ox: Math.round(container.x / tile),
        oy: Math.round(container.y / tile),
    });

    // || локальні змінні для точного drag
    let dragDX = 0,
        dragDY = 0;

    hit.on('pointerover', () => scene.input.setDefaultCursor('grab'));
    hit.on('pointerout', () => scene.input.setDefaultCursor('default'));

    hit.on('dragstart', (pointer) => {
        // різниця між курсором і позицією контейнера в світових координатах
        dragDX = pointer.worldX - container.x;
        dragDY = pointer.worldY - container.y;

        container.setAlpha(0.9);
        container.setDepth(1000); // вище за все під час тягнення
        scene.input.setDefaultCursor('grabbing');
    });

    // РУХАЄМО КОНТЕЙНЕР ПО СВІТОВИХ КООРДИНАТАХ
    hit.on('drag', (pointer) => {
        container.x = pointer.worldX - dragDX;
        container.y = pointer.worldY - dragDY;
    });

    hit.on('dragend', () => {
        // snap до сітки
        let nx = Math.round(container.x / tile) * tile;
        let ny = Math.round(container.y / tile) * tile;

        // clamp у межах світу
        nx = Phaser.Math.Clamp(
            nx,
            worldRect.x,
            worldRect.width - container.width
        );
        ny = Phaser.Math.Clamp(
            ny,
            worldRect.y,
            worldRect.height - container.height
        );

        // перевірка перекриття (через колбек сцени)
        const ok = onDropTry(nx, ny);
        if (ok) {
            container.x = nx;
            container.y = ny;
            container.setData('origin', {
                ox: Math.round(nx / tile),
                oy: Math.round(ny / tile),
            });
            // перерахувати підказки (площа/сусідство тощо)
            scene._updateIssues?.();
        } else {
            // відкат на попередню тайлову позицію
            const { ox, oy } = container.getData('origin');
            container.x = ox * tile;
            container.y = oy * tile;
            scene.tweens.add({
                targets: container,
                duration: 120,
                alpha: 0.6,
                yoyo: true,
                repeat: 1,
            });
        }

        container.setAlpha(1);
        container.setDepth(200); // повертаємо звичайний шар
        scene.input.setDefaultCursor('grab');
    });
}
