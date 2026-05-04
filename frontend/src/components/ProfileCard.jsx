import React from 'react';

export default function ProfileCard({ profile, badge, subtitle, body, actions, className = '' }) {
  const name = profile?.name || 'Profile';
  const photo = profile?.photos?.[0];

  return (
    <article className={`matchCard ${className}`.trim()}>
      <div className="matchThumb">
        {photo
          ? <img src={photo} alt={name} />
          : <div className="photoFallback">{name?.[0] || '?'}</div>}
      </div>
      <div className="matchBody">
        {badge ? <div className="scoreRow">{badge}</div> : null}
        <h3>{name}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
        {body ? <p>{body}</p> : null}
        {actions ? <div className="actionsRow">{actions}</div> : null}
      </div>
    </article>
  );
}
