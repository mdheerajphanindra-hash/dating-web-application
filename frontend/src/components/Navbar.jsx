import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <Link className="brand" to="/">BBC</Link>
        <p className="subtle">Smarter matching, safer chats, and better project polish</p>
      </div>
      <nav className="nav">
        <Link to="/matches">Matches</Link>
        <Link to="/chat">Chat</Link>
        <Link to="/likes">Likes</Link>
        <Link to="/settings">Settings</Link>
        {user?.role === 'admin' && <Link to="/admin/dashboard">Admin</Link>}
        {user ? <button onClick={onLogout}>Logout</button> : <Link to="/auth">Login</Link>}
      </nav>
    </header>
  );
}
