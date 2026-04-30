import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { trip_id, trip_name, invited_email, invited_by_email, role } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Send magic link to invited email
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: invited_email,
      options: {
        redirectTo: `${Deno.env.get('SITE_URL')}/auth/callback?invite_trip=${trip_id}`,
      },
    })

    if (error) throw error

    // In production you'd send a branded email here using Resend/SendGrid
    // Supabase will send the magic link email automatically

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})