// ============================================================
// Edge Function: admin-update-participant
// Atualiza dados de um participante + registra log
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

    const { participant_id, updates, skills, fronts } = await req.json()

    if (!participant_id) {
      return new Response(
        JSON.stringify({ error: 'Campo obrigatório: participant_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Atualizar campos principais do participante
    if (updates && Object.keys(updates).length > 0) {
      // Remover campos sensíveis que não devem ser atualizados diretamente
      const { id: _id, created_at: _ca, ...safeUpdates } = updates

      const { error: updateError } = await adminClient
        .from('participants')
        .update(safeUpdates)
        .eq('id', participant_id)

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Erro ao atualizar participante: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Atualizar skills (se fornecidas)
    if (Array.isArray(skills)) {
      await adminClient
        .from('participant_skills')
        .delete()
        .eq('participant_id', participant_id)

      if (skills.length > 0) {
        await adminClient.from('participant_skills').insert(
          skills.map((skill_id: number) => ({ participant_id, skill_id }))
        )
      }
    }

    // Atualizar frentes (se fornecidas)
    if (Array.isArray(fronts)) {
      await adminClient
        .from('participant_fronts')
        .delete()
        .eq('participant_id', participant_id)

      if (fronts.length > 0) {
        await adminClient.from('participant_fronts').insert(
          fronts.map((front_id: number) => ({ participant_id, front_id }))
        )
      }
    }

    // Log
    await adminClient.from('audit_logs').insert({
      actor_user_id: actorId,
      action: 'update_participant',
      details: { participant_id, updated_fields: Object.keys(updates || {}), skills, fronts },
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Participante atualizado com sucesso.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
