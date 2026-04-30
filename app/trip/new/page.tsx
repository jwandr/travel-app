'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createTrip } from '@/lib/trips';
import { useRouter } from 'next/navigation';

export default function NewTripPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    start_date: '',
    duration_days: 5
  });

  const handleSubmit = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    const trip = await createTrip({
      ...form,
      userId: data.user.id
    });

    router.push(`/trip/${trip.id}`);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl">Create Trip</h1>

      <input
        placeholder="Trip name"
        className="border p-2"
        onChange={(e) =>
          setForm({ ...form, name: e.target.value })
        }
      />

      <input
        type="date"
        className="border p-2"
        onChange={(e) =>
          setForm({ ...form, start_date: e.target.value })
        }
      />

      <input
        type="number"
        className="border p-2"
        value={form.duration_days}
        onChange={(e) =>
          setForm({
            ...form,
            duration_days: Number(e.target.value)
          })
        }
      />

      <button
        onClick={handleSubmit}
        className="border px-4 py-2"
      >
        Create
      </button>
    </div>
  );
}