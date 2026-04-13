// ============================================================
// Edge Function: admin-update-user-role
// Altera o papel de um usuário interno + registra log
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verificar papel do solicitante
    const { data: actorUser } = await userClient.auth.getUser()
    const actorId = actorUser.user?.id

    const { data: roleData } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', actorId)
      .single()

    if (!roleData || roleData.role !== 'administrativo') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { target_user_id, new_role } = await req.json()

    if (!target_user_id || !new_role) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: target_user_id, new_role.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['administrativo', 'coordenador'].includes(new_role)) {
      return new Response(
        JSON.stringify({ error: 'Papel inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar papel anterior para log
    const { data: oldRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', target_user_id)
      .single()

    // Upsert do papel
    const { error: updateError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: target_user_id, role: new_role }, { onConflict: 'user_id' })

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar papel: ' + updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log
    await adminClient.from('audit_logs').insert({
      actor_user_id: actorId,
      target_user_id,
      action: 'update_user_role',
      details: { old_role: oldRole?.role, new_role },
    })

    return new Response(
      JSON.stringify({ success: true, message: `Papel atualizado para ${new_role}.` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
