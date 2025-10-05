import { useState } from 'react';
import '../styles/StartForm.css';

const StartForm = ({ setConfig }) => {
    const [shape, setShape] = useState('rectangle');
    const [area, setArea] = useState(25);
    const [overallHabitats, setOverallHabitats] = useState(2);
    const [crewSize, setCrewSize] = useState(2);
    const [humansPerHabitats, setHumansPerHabitats] = useState(1);
    const [missionDuration, setMissionDuration] = useState(2160);
    const [destination, setDestination] = useState('mars');

    const onSubmit = (e) => {
        e.preventDefault();
        setConfig({
            shape,
            area,
            overallHabitats,
            crewSize,
            humansPerHabitats,
            missionDuration,
            destination,
        });
    };

    return (
        <div className="form-wrapper">
            <form onSubmit={onSubmit}>
                <h3>World settings</h3>

                <label>Habitat shape</label>
                <select
                    value={shape}
                    onChange={(e) => setShape(e.target.value)}
                >
                    <option value="rectangle">Rectangle</option>
                </select>

                <label>One habitat area per human (m²)</label>
                <input
                    type="number"
                    min="25"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                />

                <label>Overall habitats</label>
                <input
                    type="number"
                    min="2"
                    value={overallHabitats}
                    onChange={(e) => setOverallHabitats(e.target.value)}
                />

                <label>Crew size (humans)</label>
                <input
                    type="number"
                    min="1"
                    value={crewSize}
                    onChange={(e) => setCrewSize(e.target.value)}
                />

                <label>Humans per habitat</label>
                <input
                    type="number"
                    min="1"
                    value={humansPerHabitats}
                    onChange={(e) => setHumansPerHabitats(e.target.value)}
                />

                <label>Mission duration (hours)</label>
                <input
                    type="number"
                    value={missionDuration}
                    onChange={(e) => setMissionDuration(e.target.value)}
                />
                <small>≈ {Math.round(missionDuration / 24)} days</small>

                <label>Destination/Mission planet</label>
                <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                >
                    <option value="mars">Mars</option>
                </select>

                <button type="submit">Initialize world</button>
            </form>
        </div>
    );
};

export default StartForm;
