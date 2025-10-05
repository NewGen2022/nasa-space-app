import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import MainScene from './game/mainScene';

export default function Game({ config, onBack }) {
    const BG_URL = new URL(
        `./assets/bg_${config.destination}.jpg`,
        import.meta.url
    ).href;
    const mountRef = useRef(null);
    const gameRef = useRef(null);

    useEffect(() => {
        // якщо гра вже існує — знищити перед створенням нової (для live-апдейту)
        if (gameRef.current) {
            gameRef.current.destroy(true);
            gameRef.current = null;
        }

        // ---- одиниці тайла ----
        const tileMeters = Number(config.tileMeters ?? 1);
        const tileAreaM2 = tileMeters * tileMeters;
        const tilePx = Number(config.tilePx ?? 32);

        // ---- значення з форми ----
        const areaPerHuman = Number(config.area);
        const crewSize = Number(config.crewSize);
        const humansPerHabitat = Math.max(
            1,
            Number(config.humansPerHabitats || 1)
        );
        const habitatsFromForm = Math.max(
            1,
            Number(config.overallHabitats || 1)
        );

        // площа одного модуля (м²)
        const moduleAreaM2 = Math.max(
            1,
            Math.round(areaPerHuman * humansPerHabitat)
        );

        // скільки модулів треба за місткістю
        const neededByCapacity = Math.ceil(crewSize / humansPerHabitat);
        const habitatsCount = Math.max(habitatsFromForm, neededByCapacity);

        // точна площа в тайлах
        const exactTiles = Math.max(1, Math.round(moduleAreaM2 / tileAreaM2));

        // добираємо цілі множники (або найменший прямокутник ≥ exactTiles)
        const MIN_TILE_SIDE = 3;
        function pickExactFactors(N, minSide) {
            let best = null;
            const start = Math.max(minSide, Math.floor(Math.sqrt(N)));
            for (let w = start; w >= minSide; w--) {
                if (N % w === 0) {
                    const h = N / w;
                    if (h >= minSide) {
                        const delta = Math.abs(w - h);
                        if (!best || delta < best.delta) best = { w, h, delta };
                    }
                }
            }
            return best;
        }
        function pickCeilRect(N, minSide) {
            const w = Math.max(minSide, Math.ceil(Math.sqrt(N)));
            const h = Math.max(minSide, Math.ceil(N / w));
            return { w, h };
        }
        let chosen = pickExactFactors(exactTiles, MIN_TILE_SIDE);
        if (!chosen) chosen = pickCeilRect(exactTiles, MIN_TILE_SIDE);
        const wTiles = chosen.w;
        const hTiles = chosen.h;

        // випадковий розподіл екіпажу
        function randomAssign(crew, habitats, cap) {
            const res = new Array(habitats).fill(0);
            let left = crew;
            const idx = [...Array(habitats).keys()];
            while (left > 0) {
                for (let i = idx.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [idx[i], idx[j]] = [idx[j], idx[i]];
                }
                let placed = 0;
                for (const k of idx) {
                    if (left <= 0) break;
                    if (res[k] < cap) {
                        res[k] += 1;
                        left -= 1;
                        placed += 1;
                    }
                }
                if (placed === 0) break;
            }
            return res;
        }
        const crewAssignment = randomAssign(
            crewSize,
            habitatsCount,
            humansPerHabitat
        );

        const derived = {
            tileMeters,
            tilePx,
            tileAreaM2,
            moduleAreaM2,
            exactTiles,
            shapeKey: (config.shape ?? 'rectangle').toLowerCase(),
            wTiles,
            hTiles,
            habitatsCount,
            humansPerHabitat,
            crewSize,
            crewAssignment,
        };

        class Entry extends MainScene {
            constructor() {
                super(BG_URL);
            }
            preload() {
                this.load.image('bg', BG_URL);
            }
            create() {
                this.game.registry.set('user', { ...config, derived });
                super.create?.();
            }
        }

        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: mountRef.current,
            backgroundColor: '#0f0f12',
            pixelArt: true,
            physics: { default: 'arcade' },
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.NO_CENTER,
            },
            scene: [Entry],
        });

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, [config]); // <— ключ: при кожній зміні конфіга перезапускаємо гру

    return (
        <div style={{ height: '100vh', width: '100vw' }}>
            <div
                ref={mountRef}
                style={{
                    position: 'fixed',
                    inset: 0,
                    height: '100%',
                    width: '100%',
                    zIndex: 100,
                }}
            />
            {onBack && (
                <button
                    onClick={onBack}
                    style={{ position: 'fixed', right: 12, bottom: 12 }}
                >
                    Back
                </button>
            )}
        </div>
    );
}
