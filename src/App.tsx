import { useEffect, useState } from 'react';
import { loadChampions, type Champion } from './game/ddragon';
import { loadGame, saveGame } from './game/save';
import type { GameState } from './game/types';
import { renameCompetitions } from './game/season';
import { applyProPools, repairChampionPools } from './game/world';
import { Hub } from './ui/Hub';
import { NewCareer } from './ui/NewCareer';
import { Proposals } from './ui/Proposals';
import { TitleScreen } from './ui/TitleScreen';

type Screen = 'title' | 'new' | 'game';

export default function App() {
  const [champions, setChampions] = useState<Champion[] | null>(null);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<Screen>('title');
  const [game, setGame] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadChampions()
      .then(setChampions)
      .catch(() => setError('Não foi possível carregar os campeões do Data Dragon. Verifique sua conexão.'));
    loadGame().then((saved) => {
      setGame(saved);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  // Corrige pools de campeões de saves antigos assim que os campeões carregam.
  useEffect(() => {
    if (!game || !champions) return;
    if (!game.poolsFixed) setGame(repairChampionPools(game, champions));
    else {
      const withPro = applyProPools(game, champions);
      if (withPro !== game) setGame(withPro);
    }
  }, [game, champions]);

  // Saves antigos: nomes das competições atualizados para os oficiais.
  useEffect(() => {
    if (!game) return;
    const renamed = renameCompetitions(game);
    if (renamed !== game) setGame(renamed);
  }, [game]);

  if (error) return <div className="center-screen error">{error}</div>;
  if (!champions || !loaded) return <div className="center-screen">Carregando…</div>;

  if (screen === 'title' || (screen === 'game' && !game)) {
    return (
      <TitleScreen
        hasSave={!!game}
        onContinue={() => setScreen('game')}
        onNew={() => setScreen('new')}
      />
    );
  }

  if (screen === 'new') {
    return (
      <NewCareer
        champions={champions}
        onBack={() => setScreen('title')}
        onCreate={(state) => {
          setGame(state);
          setScreen('game');
        }}
      />
    );
  }

  if (!game!.coach.teamId) return <Proposals game={game!} onChange={setGame} />;
  return <Hub game={game!} champions={champions} onChange={setGame} onExit={() => setScreen('title')} />;
}
