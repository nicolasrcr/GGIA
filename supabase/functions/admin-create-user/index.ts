// ============================================================
// Edge Function: admin-create-user
// Cria um novo usuário interno (auth + profile + role + log)
// Apenas usuários com papel 'administrativo' podem chamar.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Criar cliente com a chave do usuário autenticado (para verificar papel)
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

    // Cliente com JWT do usuário (para verificar papel)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // 2. Verificar se o usuário autenticado é 'administrativo'
    const { data: roleData, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', (await userClient.auth.getUser()).data.user?.id)
      .single()

    if (roleError || !roleData || roleData.role !== 'administrativo') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores podem criar usuários.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Obter dados do corpo da requisição
    const body = await req.json()
    const { nome, email, telefone, cargo, setor, role, password } = body

    if (!nome || !email || !role) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: nome, email, role.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['administrativo', 'coordenador'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Papel inválido. Use: administrativo ou coordenador.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Criar usuário no Auth com service_role (nunca exposto ao frontend)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: password || crypto.randomUUID().slice(0, 16) + 'Aa1!',
      email_confirm: true,
      user_metadata: { nome },
    })

    if (createError || !newUser.user) {
      return new Response(
        JSON.stringify({ error: createError?.message || 'Erro ao criar usuário no Auth.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = newUser.user.id

    // 5. Criar perfil em profiles
    const { error: profileError } = await adminClient
      .from('profiles')
      .insert({
        id: userId,
        nome,
        email,
        whatsapp: telefone || null,
        cargo: cargo || null,
        setor: setor || null,
        status: 'ativo',
      })

    if (profileError) {
      // Rollback: remover usuário criado
      await adminClient.auth.admin.deleteUser(userId)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar perfil: ' + profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Criar papel em user_roles
    const { error: roleInsertError } = await adminClient
      .from('user_roles')
      .insert({ user_id: userId, role })

    if (roleInsertError) {
      await adminClient.auth.admin.deleteUser(userId)
      return new Response(
        JSON.stringify({ error: 'Erro ao definir papel: ' + roleInsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Registrar em audit_logs
    const actorUser = await userClient.auth.getUser()
    await adminClient.from('audit_logs').insert({
      actor_user_id: actorUser.data.user?.id,
      target_user_id: userId,
      action: 'create_user',
      details: { email, role, nome, cargo, setor },
    })

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        message: `Usuário ${nome} criado com papel ${role}.`,
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
