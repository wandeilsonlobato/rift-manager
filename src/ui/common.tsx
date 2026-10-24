import { useState } from 'react';
import { clamp } from '../game/random';

export function Img({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`img-fallback ${className ?? ''}`}>{alt.slice(0, 2).toUpperCase()}</div>;
  }
  // As imagens do lolesports vêm em http e redirecionam; https carrega direto.
  return <img src={src.replace(/^http:/, 'https:')} alt={alt} className={className} onError={() => setFailed(true)} />;
}

/** Bandeira do país como imagem (emojis de bandeira não aparecem no Windows). */
export function Flag({ code, className }: { code: string; className?: string }) {
  return (
    <img
      className={`flag ${className ?? ''}`}
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w80/${code.toLowerCase()}.png 2x`}
      alt={code}
    />
  );
}

export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  value = clamp(Math.round(value), 1, max);
  return (
    <span className="stars" title={`Prestígio ${value}/${max}`}>
      {'★'.repeat(value)}
      <span className="dim">{'★'.repeat(max - value)}</span>
    </span>
  );
}

export function Rating({ value }: { value: number }) {
  const tier = value >= 80 ? 'elite' : value >= 70 ? 'good' : value >= 60 ? 'ok' : 'low';
  return <span className={`rating ${tier}`}>{value}</span>;
}

export function money(k: number): string {
  return k >= 1000 ? `$${(k / 1000).toFixed(1)}M` : `$${k}k`;
}

export function FormBadge({ form }: { form: number }) {
  if (form >= 2) return <span className="form up" title={`Forma +${form}`}>▲</span>;
  if (form <= -2) return <span className="form down" title={`Forma ${form}`}>▼</span>;
  return <span className="form muted" title={`Forma ${form}`}>●</span>;
}
