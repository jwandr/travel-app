'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const signIn = async () => {
  if (loading) return;

  setLoading(true);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'http://localhost:3000/auth/callback'
    }
  });

  if (error) {
    alert(error.message);
  } else {
    setSent(true);
  }

  setLoading(false);
};

  return (
    <div className="p-6">
      <input
        className="border p-2 mr-2"
        placeholder="Enter email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        onClick={signIn}
        disabled={loading}
        className="border px-4 py-2"
      >
        {loading ? 'Sending...' : 'Login'}
      </button>

      {sent && (
        <p className="mt-3 text-sm text-gray-600">
          Check your email for the magic link ✉️
        </p>
      )}
    </div>
  );
}