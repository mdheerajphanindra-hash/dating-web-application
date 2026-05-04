import React from 'react';
import { Link } from 'react-router-dom';

export default function Home({ user }) {
  return (
    <section className="grid twoCol">
      <article className="card heroLarge">
        <h1>Dating app feel, college-project clarity.</h1>
        <p>
          This version adds smart compatibility scoring, personality quiz matching, nearby ranking, travel mode,
          daily-like control, boosts, streaks, premium demo features, AI-style chat prompts, and moderation-first safety.
        </p>
        <div className="pillRow">
          <span className="pill">Compatibility %</span>
          <span className="pill">AI safety</span>
          <span className="pill">Travel mode</span>
          <span className="pill">Premium demo</span>
        </div>
        <Link className="cta" to={user ? '/matches' : '/auth'}>{user ? 'Open matches' : 'Create profile'}</Link>
      </article>

      <article className="card">
        <h3>Professional features now included</h3>
        <ul className="list">
          <li>Personality quiz during signup and profile editing.</li>
          <li>Compatibility score with “why you match” reasoning.</li>
          <li>Distance-aware nearby sorting and travel-mode discovery.</li>
          <li>Daily likes, rewind, boosts, streaks, points, and premium demo toggles.</li>
          <li>Icebreakers, AI-style reply suggestions, GIF/sticker/game prompt messages.</li>
          <li>Profile quality rules and message content moderation.</li>
        </ul>
      </article>
    </section>
  );
}
