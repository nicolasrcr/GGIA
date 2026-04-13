// ============================================================
// js/admin.js — Painel administrativo: CRUD participantes e usuários
// ============================================================

import { supabase } from './supabase.js'
import { requireAdmin, fillUserInfo, logout } from './auth.js'
import { callFunction } from './supabase.js'

// ── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAdmin()
  if (!user) return

  await fillUserInfo()

  setupTabs()
  await Promise.all([loadParticipants(), loadUsers()])
  setupCreateUserForm()
  setupLogout()
})

// ── Abas ──────────────────────────────────────────────────────
function setupTabs() {
  const tabs    = document.querySelectorAll('[data-tab]')
  const panels  = document.querySelectorAll('[data-panel]')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab

      tabs.forEach(t => t.classList.remove('tab--active'))
      panels.forEach(p => p.classList.add('hidden'))

      tab.classList.add('tab--active')
      document.querySelector(`[data-panel="${target}"]`)?.classList.remove('hidden')
    })
  })
}

// ── Participantes ─────────────────────────────────────────────
let participantPage = 0
const PAGE_SIZE     = 20

async function loadParticipants(search = '') {
  const tbody = document.querySelector('#admin-participants-table tbody')
  if (!tbody) return

  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Carregando...</td></tr>'

  let query = supabase
    .from('participants')
    .select('id, nome, email, titulacao, vinculo_institucional, disponibilidade, interesse_coordenacao, active, created_at')
    .order('created_at', { ascending: false })
    .range(participantPage * PAGE_SIZE, (participantPage + 1) * PAGE_SIZE - 1)

  if (search) {
    query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="error-cell">Erro ao carregar: ${error.message}</td></tr>`
    return
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhum participante encontrado.</td></tr>'
    return
  }

  tbody.innerHTML = data.map(p => `
    <tr class="${p.active ? '' : 'row--inactive'}">
      <td>${esc(p.nome)}</td>
      <td>${esc(p.email)}</td>
      <td>${esc(p.titulacao || '—')}</td>
      <td>${esc(p.vinculo_institucional || '—')}</td>
      <td>${esc(p.disponibilidade || '—')}</td>
      <td class="text-center">${p.interesse_coordenacao ? '<span class="badge badge--yes">Sim</span>' : '<span class="badge badge--no">Não</span>'}</td>
      <td class="text-center">
        <span class="badge ${p.active ? 'badge--active' : 'badge--inactive'}">
          ${p.active ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td class="actions-cell">
        <button class="btn btn--sm btn--outline" onclick="editParticipant('${p.id}')">Editar</button>
        <button class="btn btn--sm ${p.active ? 'btn--warning' : 'btn--success'}"
          onclick="toggleParticipant('${p.id}', ${p.active})">
          ${p.active ? 'Inativar' : 'Ativar'}
        </button>
        <button class="btn btn--sm btn--danger" onclick="deleteParticipant('${p.id}', '${esc(p.nome)}')">Excluir</button>
      </td>
    </tr>
  `).join('')
}

// Busca de participantes
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('admin-search-participant')
  if (searchInput) {
    let timer
    searchInput.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => loadParticipants(searchInput.value.trim()), 400)
    })
  }
})

// Editar participante (abre modal)
window.editParticipant = async function(id) {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) { alert('Erro ao carregar participante.'); return }

  const [skillsRes, frontsRes, psRes, pfRes] = await Promise.all([
    supabase.from('skills').select('*').order('nome'),
    supabase.from('fronts').select('*').order('nome'),
    supabase.from('participant_skills').select('skill_id').eq('participant_id', id),
    supabase.from('participant_fronts').select('front_id').eq('participant_id', id),
  ])

  const currentSkills = (psRes.data || []).map(r => r.skill_id)
  const currentFronts = (pfRes.data || []).map(r => r.front_id)

  openParticipantModal(data, skillsRes.data || [], frontsRes.data || [], currentSkills, currentFronts)
}

function openParticipantModal(data, skills, fronts, currentSkills, currentFronts) {
  const modal = document.getElementById('participant-modal')
  if (!modal) return

  // Preencher campos do modal
  const fields = [
    'nome', 'email', 'whatsapp', 'cidade_uf', 'vinculo_institucional',
    'atuacao_principal', 'apresentacao', 'formacao', 'titulacao',
    'experiencia_academica', 'areas_pesquisa', 'producao_academica',
    'lattes_url', 'perfil_url', 'nivel_ia', 'experiencia_projetos',
    'competencias_extras', 'como_contribuir', 'disponibilidade',
    'modalidade', 'melhor_contribuicao', 'observacoes'
  ]

  fields.forEach(f => {
    const el = modal.querySelector(`[name="${f}"]`)
    if (el) el.value = data[f] || ''
  })

  // Interesse coordenação
  const coordEl = modal.querySelector('[name="interesse_coordenacao"]')
  if (coordEl) coordEl.value = data.interesse_coordenacao ? 'sim' : 'nao'

  // Skills
  const skillsContainer = modal.querySelector('#modal-skills-container')
  if (skillsContainer) {
    skillsContainer.innerHTML = skills.map(s =>
      `<label class="checkbox-label">
        <input type="checkbox" name="modal_skills" value="${s.id}" ${currentSkills.includes(s.id) ? 'checked' : ''}>
        <span>${s.nome}</span>
      </label>`
    ).join('')
  }

  // Frentes
  const frontsContainer = modal.querySelector('#modal-fronts-container')
  if (frontsContainer) {
    frontsContainer.innerHTML = fronts.map(f =>
      `<label class="checkbox-label">
        <input type="checkbox" name="modal_fronts" value="${f.id}" ${currentFronts.includes(f.id) ? 'checked' : ''}>
        <span>${f.nome}</span>
      </label>`
    ).join('')
  }

  // ID oculto
  const idEl = modal.querySelector('[name="participant_id"]')
  if (idEl) idEl.value = data.id

  modal.classList.remove('hidden')
  modal.querySelector('.modal__content')?.scrollTo(0, 0)
}

// Salvar edição do participante
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-participant-btn')
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const modal = document.getElementById('participant-modal')
      if (!modal) return

      const id = modal.querySelector('[name="participant_id"]').value

      const updates = {}
      const fields = [
        'nome', 'email', 'whatsapp', 'cidade_uf', 'vinculo_institucional',
        'atuacao_principal', 'apresentacao', 'formacao', 'titulacao',
        'experiencia_academica', 'areas_pesquisa', 'producao_academica',
        'lattes_url', 'perfil_url', 'nivel_ia', 'experiencia_projetos',
        'competencias_extras', 'como_contribuir', 'disponibilidade',
        'modalidade', 'melhor_contribuicao', 'observacoes'
      ]
      fields.forEach(f => {
        const el = modal.querySelector(`[name="${f}"]`)
        if (el) updates[f] = el.value || null
      })

      const coordEl = modal.querySelector('[name="interesse_coordenacao"]')
      updates.interesse_coordenacao = coordEl?.value === 'sim'

      const skills = [...modal.querySelectorAll('input[name="modal_skills"]:checked')].map(el => Number(el.value))
      const fronts = [...modal.querySelectorAll('input[name="modal_fronts"]:checked')].map(el => Number(el.value))

      try {
        showModalStatus(modal, 'Salvando...', 'info')
        await callFunction('admin-update-participant', { participant_id: id, updates, skills, fronts })
        showModalStatus(modal, 'Salvo com sucesso!', 'success')
        setTimeout(() => closeModal('participant-modal'), 1500)
        await loadParticipants()
      } catch (err) {
        showModalStatus(modal, 'Erro: ' + err.message, 'error')
      }
    })
  }
})

window.toggleParticipant = async function(id, currentActive) {
  const newStatus = !currentActive
  const action = newStatus ? 'ativar' : 'inativar'

  if (!confirm(`Deseja ${action} este participante?`)) return

  try {
    await callFunction('admin-update-participant', { participant_id: id, updates: { active: newStatus } })
    await loadParticipants()
    showToast(`Participante ${newStatus ? 'ativado' : 'inativado'} com sucesso.`)
  } catch (err) {
    alert('Erro: ' + err.message)
  }
}

window.deleteParticipant = async function(id, nome) {
  if (!confirm(`Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`)) return

  const { error } = await supabase.from('participants').delete().eq('id', id)
  if (error) { alert('Erro ao excluir: ' + error.message); return }

  showToast('Participante excluído.')
  await loadParticipants()
}

// ── Usuários internos ─────────────────────────────────────────
async function loadUsers() {
  const tbody = document.querySelector('#admin-users-table tbody')
  if (!tbody) return

  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Carregando...</td></tr>'

  const { data, error } = await supabase
    .from('profiles')
    .select(`id, nome, email, cargo, setor, status, user_roles(role)`)
    .order('nome')

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="error-cell">Erro: ${error.message}</td></tr>`
    return
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Nenhum usuário encontrado.</td></tr>'
    return
  }

  tbody.innerHTML = data.map(u => {
    const role = u.user_roles?.[0]?.role || '—'
    return `
      <tr class="${u.status === 'inativo' ? 'row--inactive' : ''}">
        <td>${esc(u.nome || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td>${esc(u.cargo || '—')}</td>
        <td>
          <span class="badge ${role === 'administrativo' ? 'badge--admin' : 'badge--coord'}">
            ${role === 'administrativo' ? 'Administrador' : 'Coordenador'}
          </span>
        </td>
        <td>
          <span class="badge ${u.status === 'ativo' ? 'badge--active' : 'badge--inactive'}">
            ${u.status || 'ativo'}
          </span>
        </td>
        <td class="actions-cell">
          <select class="select--sm" onchange="changeUserRole('${u.id}', this.value)">
            <option value="coordenador" ${role === 'coordenador' ? 'selected' : ''}>Coordenador</option>
            <option value="administrativo" ${role === 'administrativo' ? 'selected' : ''}>Administrador</option>
          </select>
          <button class="btn btn--sm ${u.status === 'ativo' ? 'btn--warning' : 'btn--success'}"
            onclick="toggleUser('${u.id}', '${u.status}')">
            ${u.status === 'ativo' ? 'Inativar' : 'Ativar'}
          </button>
          <button class="btn btn--sm btn--danger" onclick="deleteUser('${u.id}', '${esc(u.nome || '')}')">Excluir</button>
        </td>
      </tr>
    `
  }).join('')
}

window.changeUserRole = async function(userId, newRole) {
  try {
    await callFunction('admin-update-user-role', { target_user_id: userId, new_role: newRole })
    showToast(`Papel atualizado para ${newRole}.`)
  } catch (err) {
    alert('Erro: ' + err.message)
    await loadUsers() // Reverter UI
  }
}

window.toggleUser = async function(userId, currentStatus) {
  const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo'
  if (!confirm(`Deseja ${newStatus === 'inativo' ? 'inativar' : 'ativar'} este usuário?`)) return

  try {
    if (newStatus === 'inativo') {
      await callFunction('admin-delete-user', { target_user_id: userId, hard_delete: false })
    } else {
      const { error } = await supabase.from('profiles').update({ status: 'ativo' }).eq('id', userId)
      if (error) throw error
    }
    showToast(`Usuário ${newStatus === 'inativo' ? 'inativado' : 'ativado'}.`)
    await loadUsers()
  } catch (err) {
    alert('Erro: ' + err.message)
  }
}

window.deleteUser = async function(userId, nome) {
  if (!confirm(`Excluir "${nome}" permanentemente? Isso remove o acesso ao sistema.`)) return

  try {
    await callFunction('admin-delete-user', { target_user_id: userId, hard_delete: true })
    showToast('Usuário excluído.')
    await loadUsers()
  } catch (err) {
    alert('Erro: ' + err.message)
  }
}

// ── Criar novo usuário ────────────────────────────────────────
function setupCreateUserForm() {
  const form = document.getElementById('create-user-form')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn    = form.querySelector('[type="submit"]')
    const msgEl  = document.getElementById('create-user-message')

    const fd = new FormData(form)
    const payload = {
      nome:     fd.get('nome')?.trim(),
      email:    fd.get('email')?.trim().toLowerCase(),
      telefone: fd.get('telefone')?.trim() || undefined,
      cargo:    fd.get('cargo')?.trim() || undefined,
      setor:    fd.get('setor')?.trim() || undefined,
      role:     fd.get('role'),
      password: fd.get('password') || undefined,
    }

    if (!payload.nome || !payload.email || !payload.role) {
      showMessage(msgEl, 'Preencha nome, e-mail e perfil.', 'error')
      return
    }

    btn.disabled = true
    btn.textContent = 'Criando...'
    clearMessage(msgEl)

    try {
      const result = await callFunction('admin-create-user', payload)
      showMessage(msgEl, result.message || 'Usuário criado com sucesso!', 'success')
      form.reset()
      await loadUsers()

      // Mudar para aba de usuários
      document.querySelector('[data-tab="users"]')?.click()
    } catch (err) {
      showMessage(msgEl, err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Criar usuário'
    }
  })
}

// ── Modal helpers ─────────────────────────────────────────────
window.closeModal = function(modalId) {
  document.getElementById(modalId)?.classList.add('hidden')
}

function showModalStatus(modal, text, type) {
  const el = modal.querySelector('.modal__status')
  if (!el) return
  el.textContent = text
  el.className = `modal__status modal__status--${type}`
}

// ── Toast notifications ───────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'toast'
    toast.className = 'toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.add('toast--visible')
  setTimeout(() => toast.classList.remove('toast--visible'), 3000)
}

// ── Helpers ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function showMessage(el, text, type) {
  if (!el) return
  el.textContent = text
  el.className = `form-message form-message--${type}`
  el.classList.remove('hidden')
}

function clearMessage(el) {
  if (!el) return
  el.textContent = ''
  el.className = 'form-message hidden'
}

function setupLogout() {
  const btn = document.getElementById('logout-btn')
  if (btn) btn.addEventListener('click', logout)
}
