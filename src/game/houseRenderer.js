import { TILE_PX } from './layoutCalc';

export function renderHouse(scene, ox, oy, wTiles, hTiles, opts = {}) {
    const { name = 'Habitat', humans = 0, capacity = 0 } = opts;

    const x = ox * TILE_PX;
    const y = oy * TILE_PX;
    const W = wTiles * TILE_PX;
    const H = hTiles * TILE_PX;

    const c = scene.add.container(x, y).setDepth(200);
    c.setSize(W, H);

    const g = scene.add.graphics().setName('gfx');
    g.fillStyle(0x2b2f38, 0.9).fillRect(0, 0, W, H);
    g.lineStyle(1, 0xffffff, 0.08);
    for (let xx = TILE_PX; xx < W; xx += TILE_PX) g.lineBetween(xx, 0, xx, H);
    for (let yy = TILE_PX; yy < H; yy += TILE_PX) g.lineBetween(0, yy, W, yy);
    g.lineStyle(2, 0x8fe3ff, 1).strokeRect(1, 1, W - 2, H - 2);

    const door = scene.add
        .rectangle(W / 2, H - 1, TILE_PX - 6, 6, 0x6be674)
        .setOrigin(0.5, 1)
        .setName('door');
    const winL = scene.add
        .rectangle(2, H / 2, 6, TILE_PX - 8, 0xbee3f8)
        .setOrigin(0, 0.5)
        .setName('winL');
    const winR = scene.add
        .rectangle(W - 2, H / 2, 6, TILE_PX - 8, 0xbee3f8)
        .setOrigin(1, 0.5)
        .setName('winR');

    const hit = scene.add.zone(0, 0, W, H).setOrigin(0).setName('hit');

    const labelStyle = {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
    };

    // editable title — top-left
    const nameTxt = scene.add
        .text(4, 4, String(name), labelStyle)
        .setName('labelName')
        .setDepth(1)
        .setInteractive({ cursor: 'text' });

    nameTxt.on('pointerup', (pointer) => {
        if (pointer.event && pointer.event.detail === 2) {
            const next = window.prompt(
                'Habitat name by its purpose:',
                nameTxt.text
            );
            if (next !== null && next.trim() !== '') {
                nameTxt.setText(next.trim());
                c.setData('name', next.trim());
            }
        }
    });

    // people — top-right: "X/Y ppl" (double click to edit X)
    const pplTxt = scene.add
        .text(W - 4, 20, `${humans}/${capacity} ppl`, labelStyle)
        .setOrigin(1, 0)
        .setName('labelHumans')
        .setDepth(1)
        .setInteractive({ cursor: 'pointer' });

    pplTxt.on('pointerup', (pointer) => {
        if (pointer.event && pointer.event.detail === 2) {
            const current = c.getData('humans') ?? humans;
            const cap = c.getData('capacity') ?? capacity;
            const nextRaw = window.prompt(
                `Set people (0-${cap}):`,
                String(current)
            );
            if (nextRaw === null) return;
            const next = parseInt(nextRaw, 10);
            if (!Number.isFinite(next)) return;

            // делегуємо сцені (вона знає про загальну чисельність екіпажу)
            c.emit('requestSetHumans', next);
        }
    });

    c.add([g, door, winL, winR, hit, nameTxt, pplTxt]);

    c.setData('name', name);
    c.setData('humans', humans);
    c.setData('capacity', capacity);

    return c;
}
