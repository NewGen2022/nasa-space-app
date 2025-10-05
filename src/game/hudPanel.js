// Темно-сіра панель з усім config (auto-fit + скруглення)
export function createHudPanel(scene, cfg, pos = 'topleft') {
    const pad = 10;
    const style = { color: '#fff', fontFamily: 'monospace', fontSize: '14px' };
    const lines = [
        `Planet: ${cfg.destination?.toUpperCase()}`,
        `Shape: ${cfg.shape}`,
        `Area/person: ${cfg.area} m²`,
        `Habitats: ${cfg.overallHabitats}`,
        `Crew: ${cfg.crewSize}`,
        `Humans per habitat: ${cfg.humansPerHabitats}`,
        `Mission: ${Math.round(cfg.missionDuration / 24)} days`,
    ];

    const txt = scene.add
        .text(0, 0, lines.join('\n'), style)
        .setScrollFactor(0);
    const b = txt.getBounds();

    const g = scene.add.graphics().setScrollFactor(0);
    const place = () => {
        let x = 20,
            y = 20;
        if (pos.includes('right'))
            x = scene.scale.width - (b.width + pad * 2) - 20;
        if (pos.includes('bottom'))
            y = scene.scale.height - (b.height + pad * 2) - 20;

        txt.setPosition(x + pad, y + pad);
        g.clear()
            .fillStyle(0x222222, 0.85)
            .fillRoundedRect(x, y, b.width + pad * 2, b.height + pad * 2, 8);
    };

    place();
    scene.scale.on('resize', place, scene);
    txt.setDepth(1);
    return { txt, g };
}
