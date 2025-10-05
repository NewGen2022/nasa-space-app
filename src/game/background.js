export function createBackground(scene, textureKey) {
    const bg = scene.add.image(0, 0, textureKey).setOrigin(0);
    const fit = () => bg.setDisplaySize(scene.scale.width, scene.scale.height);
    fit();
    scene.scale.on('resize', fit, scene);

    scene.cameras.main.roundPixels = true;

    bg.setScrollFactor(0); // «приклеєний» до екрану
    bg.setDepth(-100); // НИЖЧЕ за все інше
    return bg;
}
