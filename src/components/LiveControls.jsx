import { useEffect, useState } from 'react';
import '../styles/LiveControls.css';

export default function LiveControls({ initial, onApply }) {
    // локальні стейти, стартують з initial
    const [area, setArea] = useState(Number(initial.area ?? 25));
    const [crewSize, setCrewSize] = useState(Number(initial.crewSize ?? 4));
    const [humansPerHabitat, setHumansPerHabitat] = useState(
        Number(initial.humansPerHabitats ?? 2)
    );
    const [overallHabitats, setOverallHabitats] = useState(
        Number(initial.overallHabitats ?? 2)
    );
    const [shape, setShape] = useState(String(initial.shape ?? 'rectangle'));
    const [tilePx, setTilePx] = useState(Number(initial.tilePx ?? 32));

    // якщо initial змінюється (наприклад, після повернення на форму) — синхронізуємо
    useEffect(() => {
        setArea(Number(initial.area ?? 25));
        setCrewSize(Number(initial.crewSize ?? 4));
        setHumansPerHabitat(Number(initial.humansPerHabitats ?? 2));
        setOverallHabitats(Number(initial.overallHabitats ?? 2));
        setShape(String(initial.shape ?? 'rectangle'));
        setTilePx(Number(initial.tilePx ?? 32));
    }, [initial]);

    const applyNow = () => {
        onApply({
            ...initial,
            area: Number(area),
            crewSize: Number(crewSize),
            humansPerHabits: undefined, // захист від опечаток
            humansPerHabitats: Number(humansPerHabitat),
            overallHabitats: Number(overallHabitats),
            shape,
            tilePx: Number(tilePx),
        });
    };

    return (
        <div className="live-controls">
            <div className="lc-title">World params</div>

            <label>
                Area per human (m²)
                <input
                    type="number"
                    min="1"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                />
            </label>

            <label>
                Crew size (humans)
                <input
                    type="number"
                    min="0"
                    value={crewSize}
                    onChange={(e) => setCrewSize(e.target.value)}
                />
            </label>

            <label>
                Humans per habitat
                <input
                    type="number"
                    min="1"
                    value={humansPerHabitat}
                    onChange={(e) => setHumansPerHabitat(e.target.value)}
                />
            </label>

            <label>
                Overall habitats
                <input
                    type="number"
                    min="1"
                    value={overallHabitats}
                    onChange={(e) => setOverallHabitats(e.target.value)}
                />
            </label>

            <label>
                Shape
                <select
                    value={shape}
                    onChange={(e) => setShape(e.target.value)}
                >
                    <option value="rectangle">Rectangle</option>
                    <option value="square">Square</option>
                    <option value="circle">Circle (bbox)</option>
                    <option value="hexagon">Hexagon (bbox)</option>
                </select>
            </label>

            <label>
                Tile size (px)
                <input
                    type="number"
                    min="16"
                    step="1"
                    value={tilePx}
                    onChange={(e) => setTilePx(e.target.value)}
                />
            </label>

            <button className="lc-apply" onClick={applyNow}>
                Apply
            </button>
        </div>
    );
}
