// ============================================================
// js/supabase.js — Cliente Supabase centralizado
// Substitua SUPABASE_URL e SUPABASE_ANON_KEY pelas suas
// credenciais do projeto no painel do Supabase.
// NUNCA coloque a service_role key aqui.
// ============================================================

// Supabase é carregado via <script> UMD nos HTMLs — window.supabase estará disponível.
// NÃO usar ESM import do CDN aqui: evita falhas em browsers com restrições de módulo.
const { createClient } = window.supabase

// ── Configuração ─────────────────────────────────────────────
// Edite estes dois valores após criar seu projeto no Supabase.
const SUPABASE_URL      = 'https://labdvjkcngcpmugryznn.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhYmR2amtjbmdjcG11Z3J5em5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjc0MzYsImV4cCI6MjA5MTk0MzQzNn0.er_2ceLid1zMO_eciuM_h6oTXijEF2QrsVf__Nlyyk4'

// URLs das Edge Functions (derivadas automaticamente)
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

// ── Cliente singleton ─────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,          // mantém sessão no localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ── Helper: chamar Edge Function autenticada ──────────────────
/**
 * Chama uma Edge Function com o token JWT do usuário atual.
 * @param {string} functionName  Nome da função (ex: 'admin-create-user')
 * @param {object} body          Payload JSON
 * @returns {Promise<object>}    Resposta parseada
 */
export async function callFunction(functionName, body) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) throw new Error('Usuário não autenticado.')

  let response
  try {
    response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
  } catch (fetchErr) {
    const msg = (fetchErr.message || '').toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network'))
      throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.')
    throw new Error('Erro de rede: ' + fetchErr.message)
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error(`Resposta inválida do servidor (função: ${functionName}).`)
  }

  if (!response.ok) {
    throw new Error(result.error || `Erro ao executar a operação (${functionName}).`)
  }

  return result
}
