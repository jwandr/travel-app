import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        }
      }
    }
  );
}

export async function getTrip(tripId: string) {
  const supabase = createServerSupabase();

  const { data: days, error } = await supabase
    .from('days')
    .select('*')
    .eq('trip_id', tripId)
    .order('day_index');

  if (error) {
    console.error('GET TRIP ERROR:', error);
    throw error;
  }

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId);

  return days.map(day => ({
    ...day,
    items: items?.filter(i => i.day_id === day.id) ?? []
  }));
}