import React from 'react';

export default function Login({ form, setForm, onSubmit, message }) {
  return (
    <>
      <h2>Login</h2>
      <p className="subtle">Log in to continue to your profile or matches.</p>
      <form className="form" onSubmit={onSubmit}>
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <button>Submit</button>
      </form>
      {message && <p className="notice">{message}</p>}
    </>
  );
}
