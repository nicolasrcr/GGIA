// ============================================================
// js/auth.js — Login, logout, proteção de rotas, papel do usuário
// ============================================================

import { supabase } from './supabase.js'

// ── Cache do papel do usuário ─────────────────────────────────
let _cachedRole = null

/**
 * Retorna o papel do usuário autenticado ('administrativo' | 'coordenador' | null).
 */
export async function getUserRole() {
  if (_cachedRole) return _cachedRole

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (error || !data) return null

  _cachedRole = data.role
  return _cachedRole
}

/**
 * Retorna o usuário autenticado ou null.
 */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Retorna o perfil do usuário autenticado.
 */
export async function getUserProfile() {
  const user = await getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

// ── Proteção de rotas ─────────────────────────────────────────

/**
 * Redireciona para login.html se não autenticado.
 * Uso: chamar no topo de páginas protegidas.
 */
export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    window.location.href = 'login.html'
    return null
  }
  return user
}

/**
 * Exige papel 'administrativo'. Redireciona se não for.
 */
export async function requireAdmin() {
  const user = await requireAuth()
  if (!user) return null

  const role = await getUserRole()
  if (role !== 'administrativo') {
    window.location.href = 'dashboard.html'
    return null
  }
  return user
}

/**
 * Exige papel 'administrativo' ou 'coordenador'.
 */
export async function requireInternalUser() {
  const user = await requireAuth()
  if (!user) return null

  const role = await getUserRole()
  if (!['administrativo', 'coordenador'].includes(role)) {
    window.location.href = 'login.html'
    return null
  }
  return user
}

// ── Login / Logout ────────────────────────────────────────────

/**
 * Realiza login com e-mail e senha.
 * @returns {{ user, role } | { error }}
 */
export async function login(email, password) {
  _cachedRole = null

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: error.message }

  const role = await getUserRole()
  return { user: data.user, role }
}

/**
 * Realiza logout e redireciona para login.html.
 */
export async function logout() {
  _cachedRole = null
  await supabase.auth.signOut()
  window.location.href = 'login.html'
}

// ── Exibir nome do usuário na UI ──────────────────────────────

/**
 * Preenche elementos com data-user-name com o nome do usuário logado.
 */
export async function fillUserInfo() {
  const profile = await getUserProfile()
  const role    = await getUserRole()

  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = profile?.nome || 'Usuário'
  })
  document.querySelectorAll('[data-user-role]').forEach(el => {
    el.textContent = role === 'administrativo' ? 'Administrador' : 'Coordenador'
  })
  document.querySelectorAll('[data-user-email]').forEach(el => {
    el.textContent = profile?.email || ''
  })
}
