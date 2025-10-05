import { useState } from 'react';
import StartForm from './components/StartForm';
import Game from './Game';
import LiveControls from './components/LiveControls';

export default function App() {
    const [config, setConfig] = useState(null);

    return (
        <>
            {!config ? (
                <StartForm setConfig={setConfig} />
            ) : (
                <>
                    <Game config={config} onBack={() => setConfig(null)} />
                    <LiveControls
                        initial={config}
                        onApply={(next) => setConfig(next)}
                    />
                </>
            )}
        </>
    );
}
