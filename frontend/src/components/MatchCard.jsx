import React from 'react';
import { Link } from 'react-router-dom';

export default function MatchCard({
  match,
  hobbies = [],
  alreadyLiked = false,
  onLikeToggle,
  onStar,
  onOpen,
  suggested = false
}) {
  const profile = match?.otherUser;
  const content = (
    <>
      <div className="matchThumb">
        {profile?.photos?.[0]
          ? <img src={profile.photos[0]} alt={profile?.name || 'Match'} />
          : <div className="photoFallback">{profile?.name?.[0] || '?'}</div>}
      </div>
      <div className="matchBody">
        <div className="scoreRow">
          <span className="score">{match.compatibilityScore}% match</span>
          <span className="badge">{suggested ? (match.isVirtual ? 'Profile' : 'Suggested for you') : 'Chat ready'}</span>
        </div>
        <h3>{profile?.name}</h3>
        <p>{profile?.location || 'Nearby'} • {profile?.gender || 'Open'}</p>
        {hobbies.length ? <p>Hobbies: {hobbies.join(', ')}</p> : null}
        {suggested && profile?.bio ? <p>{profile.bio}</p> : null}
        <p>{(match.compatibilityReasons || []).join(' • ')}</p>
        <div className="actionsRow" onClick={(event) => event.stopPropagation()}>
          <button className={suggested ? '' : 'ghost'} onClick={onLikeToggle}>{alreadyLiked ? 'Unlike' : 'Like'}</button>
          <button className="ghost" onClick={onStar}>{!suggested && match.isStarred ? 'Unstar' : 'Star'}</button>
          <button onClick={onOpen}>{suggested ? 'Open chat' : 'Open chat'}</button>
        </div>
      </div>
    </>
  );

  if (suggested) {
    return <article className="matchCard">{content}</article>;
  }

  return <Link className="matchCard" to={`/chat/${match._id}`}>{content}</Link>;
}
