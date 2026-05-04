import React from 'react';

export default function Register({ form, setForm, onSubmit, message }) {
  return (
    <>
      <h2>Create account</h2>
      <p className="subtle">Create your account first. After OTP verification, we will guide you through the BBC profile setup.</p>
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
