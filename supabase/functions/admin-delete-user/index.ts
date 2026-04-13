// ============================================================
// Edge Function: admin-delete-user
// Remove ou desativa um usuário interno + registra log
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

    const { target_user_id, hard_delete } = await req.json()

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: 'Campo obrigatório: target_user_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Impedir que admin delete a si mesmo
    if (target_user_id === actorId) {
      return new Response(
        JSON.stringify({ error: 'Você não pode remover sua própria conta.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    if (hard_delete) {
      // Exclusão definitiva do Auth (cascade deleta profiles e user_roles)
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(target_user_id)

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: 'Erro ao excluir: ' + deleteError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await adminClient.from('audit_logs').insert({
        actor_user_id: actorId,
        target_user_id,
        action: 'hard_delete_user',
        details: {},
      })
    } else {
      // Desativação suave: marca status como 'inativo'
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ status: 'inativo' })
        .eq('id', target_user_id)

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Erro ao desativar: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await adminClient.from('audit_logs').insert({
        actor_user_id: actorId,
        target_user_id,
        action: 'deactivate_user',
        details: {},
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: hard_delete ? 'Usuário excluído.' : 'Usuário desativado.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
