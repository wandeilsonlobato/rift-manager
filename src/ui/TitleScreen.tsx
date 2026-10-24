import { useState } from 'react';
import { championSplash } from '../game/ddragon';
import logo from '../assets/logo-640.jpg';

interface Props {
  hasSave: boolean;
  onContinue: () => void;
  onNew: () => void;
}

// Splash arts que se revezam no fundo da tela inicial.
const SPLASHES = ['Aatrox', 'Ahri', 'Jinx', 'Thresh', 'LeeSin', 'Yasuo', 'Kaisa', 'Azir', 'Viego', 'Orianna'];

export function TitleScreen({ hasSave, onContinue, onNew }: Props) {
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  return (
    <div className="center-screen title-screen">
      <div className="title-bg" style={{ backgroundImage: `url(${championSplash(splash)})` }} />
      <h1 className="title-logo-wrap">
        <img src={logo} alt="Rift Manager" className="title-logo" />
      </h1>
      <p className="subtitle">Seja o coach. Monte a lenda.</p>
      <div className="title-actions">
        {hasSave && (
          <button className="btn primary" onClick={onContinue}>
            Continuar carreira
          </button>
        )}
        <button className={`btn ${hasSave ? '' : 'primary'}`} onClick={onNew}>
          Nova carreira
        </button>
      </div>
      <p className="disclaimer">
        Protótipo de fã, sem fins comerciais. Rift Manager não é endossado pela Riot Games e não
        reflete as opiniões da Riot Games ou de qualquer pessoa oficialmente envolvida na produção ou
        gestão de League of Legends. League of Legends e Riot Games são marcas registradas da Riot
        Games, Inc.
      </p>
    </div>
  );
}
