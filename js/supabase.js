// ============================================================
// js/supabase.js — Cliente Supabase centralizado
// Substitua SUPABASE_URL e SUPABASE_ANON_KEY pelas suas
// credenciais do projeto no painel do Supabase.
// NUNCA coloque a service_role key aqui.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ── Configuração ─────────────────────────────────────────────
// Edite estes dois valores após criar seu projeto no Supabase.
const SUPABASE_URL      = 'https://SEU_PROJECT_REF.supabase.co'
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_PUBLICA'

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

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `Erro na função ${functionName}`)
  }

  return result
}
