// ============================================================
// js/form.js — Submissão do formulário público
// Salva rascunho automaticamente no localStorage e envia
// os dados para o Supabase ao clicar em "Enviar formulário".
// ============================================================

import { supabase } from './supabase.js'

const DRAFT_KEY = 'ggia_form_draft'

// ── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalogs()
  restoreDraft()
  setupAutosave()
  setupProgressBar()
  setupFormSubmit()
})

// ── Carregar catálogos (skills e frentes) ─────────────────────
async function loadCatalogs() {
  const [skillsRes, frontsRes] = await Promise.all([
    supabase.from('skills').select('id, nome').order('nome'),
    supabase.from('fronts').select('id, nome').order('nome'),
  ])

  const skillsContainer = document.getElementById('skills-container')
  const frontsContainer = document.getElementById('fronts-container')

  if (skillsRes.data && skillsContainer) {
    skillsContainer.innerHTML = skillsRes.data.map(s =>
      `<label class="checkbox-label">
        <input type="checkbox" name="skills" value="${s.id}">
        <span>${s.nome}</span>
      </label>`
    ).join('')
  }

  if (frontsRes.data && frontsContainer) {
    frontsContainer.innerHTML = frontsRes.data.map(f =>
      `<label class="checkbox-label">
        <input type="checkbox" name="fronts" value="${f.id}">
        <span>${f.nome}</span>
      </label>`
    ).join('')
  }
}

// ── Barra de progresso ────────────────────────────────────────
function setupProgressBar() {
  const form = document.getElementById('main-form')
  const bar  = document.getElementById('progress-bar')
  const pct  = document.getElementById('progress-percent')
  if (!form || !bar) return

  const updateProgress = () => {
    // Coletar campos obrigatórios, desduplicando grupos de radio pelo name
    const allRequired = form.querySelectorAll('[required]')
    const seenRadioNames = new Set()
    const fields = []

    allRequired.forEach(el => {
      if (el.type === 'radio') {
        if (!seenRadioNames.has(el.name)) {
          seenRadioNames.add(el.name)
          fields.push({ type: 'radio', name: el.name })
        }
      } else {
        fields.push({ type: el.type || 'text', el })
      }
    })

    const filled = fields.filter(f => {
      if (f.type === 'radio') {
        return form.querySelector(`input[name="${f.name}"]:checked`) !== null
      }
      return f.el.value.trim() !== ''
    }).length

    const percent = fields.length ? Math.round((filled / fields.length) * 100) : 0
    bar.style.width = percent + '%'
    if (pct) pct.textContent = percent + '%'
  }

  form.addEventListener('input', updateProgress)
  form.addEventListener('change', updateProgress)
  updateProgress()
}

// ── Salvamento automático ─────────────────────────────────────
function setupAutosave() {
  const form = document.getElementById('main-form')
  if (!form) return

  let timer = null
  form.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(saveDraft, 800)
  })
  form.addEventListener('change', () => {
    clearTimeout(timer)
    timer = setTimeout(saveDraft, 800)
  })
}

function saveDraft() {
  const form = document.getElementById('main-form')
  if (!form) return

  const data = {}
  const elements = form.elements

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el.name) continue

    if (el.type === 'checkbox') {
      if (!data[el.name]) data[el.name] = []
      if (el.checked) data[el.name].push(el.value)
    } else if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value
    } else {
      data[el.name] = el.value
    }
  }

  localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  showDraftSaved()
}

function showDraftSaved() {
  const indicator = document.getElementById('draft-indicator')
  if (!indicator) return
  indicator.textContent = '✓ Rascunho salvo automaticamente'
  indicator.classList.add('visible')
  setTimeout(() => indicator.classList.remove('visible'), 2000)
}

function restoreDraft() {
  const saved = localStorage.getItem(DRAFT_KEY)
  if (!saved) return

  let data
  try { data = JSON.parse(saved) } catch { return }

  const form = document.getElementById('main-form')
  if (!form) return

  // Aguardar catálogos carregarem antes de restaurar checkboxes
  setTimeout(() => {
    for (const [name, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        // Checkbox group
        const checkboxes = form.querySelectorAll(`input[name="${name}"]`)
        checkboxes.forEach(cb => {
          cb.checked = value.includes(cb.value)
        })
      } else {
        const el = form.elements[name]
        if (!el) continue
        if (el.type === 'radio') {
          const radio = form.querySelector(`input[name="${name}"][value="${value}"]`)
          if (radio) radio.checked = true
        } else {
          el.value = value
        }
      }
    }

    const banner = document.getElementById('draft-banner')
    if (banner) banner.classList.remove('hidden')
  }, 500)
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
  const banner = document.getElementById('draft-banner')
  if (banner) banner.classList.add('hidden')
}

// ── Submissão do formulário ───────────────────────────────────
function setupFormSubmit() {
  const form = document.getElementById('main-form')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    await submitForm(form)
  })
}

async function submitForm(form) {
  const btn = document.getElementById('submit-btn')
  const msgEl = document.getElementById('form-message')

  // Verificar consentimento
  const consent = form.querySelector('input[name="consentimento"]')
  if (!consent || !consent.checked) {
    showMessage(msgEl, 'Você precisa aceitar os termos para enviar o formulário.', 'error')
    return
  }

  setLoading(btn, true)
  clearMessage(msgEl)

  try {
    // Coletar dados do formulário
    const fd = new FormData(form)

    const participantData = {
      nome:                  fd.get('nome')?.trim() || '',
      email:                 fd.get('email')?.trim().toLowerCase() || '',
      whatsapp:              fd.get('whatsapp')?.trim() || null,
      cidade_uf:             fd.get('cidade_uf')?.trim() || null,
      vinculo_institucional: fd.get('vinculo_institucional')?.trim() || null,
      atuacao_principal:     fd.get('atuacao_principal')?.trim() || null,
      apresentacao:          fd.get('apresentacao')?.trim() || null,
      formacao:              fd.get('formacao')?.trim() || null,
      titulacao:             fd.get('titulacao')?.trim() || null,
      experiencia_academica: fd.get('experiencia_academica')?.trim() || null,
      areas_pesquisa:        fd.get('areas_pesquisa')?.trim() || null,
      producao_academica:    fd.get('producao_academica')?.trim() || null,
      lattes_url:            fd.get('lattes_url')?.trim() || null,
      perfil_url:            fd.get('perfil_url')?.trim() || null,
      nivel_ia:              fd.get('nivel_ia') || null,
      experiencia_projetos:  fd.get('experiencia_projetos') || null,
      competencias_extras:   fd.get('competencias_extras')?.trim() || null,
      como_contribuir:       fd.get('como_contribuir')?.trim() || null,
      disponibilidade:       fd.get('disponibilidade') || null,
      modalidade:            fd.get('modalidade') || null,
      interesse_coordenacao: fd.get('interesse_coordenacao') === 'sim',
      melhor_contribuicao:   fd.get('melhor_contribuicao')?.trim() || null,
      observacoes:           fd.get('observacoes')?.trim() || null,
      consentimento:         true,
    }

    const skillIds  = fd.getAll('skills').map(Number)
    const frontIds  = fd.getAll('fronts').map(Number)

    // Validações básicas
    if (!participantData.nome) {
      showMessage(msgEl, 'Por favor, informe seu nome completo.', 'error')
      setLoading(btn, false)
      return
    }
    if (!participantData.email || !participantData.email.includes('@')) {
      showMessage(msgEl, 'Por favor, informe um e-mail válido.', 'error')
      setLoading(btn, false)
      return
    }

    // Gerar UUID no cliente — evita a necessidade de SELECT após INSERT
    // (anon não tem permissão de SELECT na tabela participants)
    const participantId = crypto.randomUUID()

    // 1. Inserir participante (sem .select() para não exigir permissão de leitura)
    const { error: participantError } = await supabase
      .from('participants')
      .insert({ id: participantId, ...participantData })

    if (participantError) {
      if (participantError.code === '23505') {
        showMessage(msgEl, 'Este e-mail já foi cadastrado. Obrigado pela participação!', 'info')
      } else {
        throw new Error(participantError.message)
      }
      setLoading(btn, false)
      return
    }

    // 2. Inserir skills
    if (skillIds.length > 0) {
      await supabase.from('participant_skills').insert(
        skillIds.map(skill_id => ({ participant_id: participantId, skill_id }))
      )
    }

    // 3. Inserir frentes
    if (frontIds.length > 0) {
      await supabase.from('participant_fronts').insert(
        frontIds.map(front_id => ({ participant_id: participantId, front_id }))
      )
    }

    // 4. Salvar payload bruto
    await supabase.from('submissions_raw').insert({
      participant_id: participantId,
      payload: Object.fromEntries(fd.entries()),
      source: 'web_form',
    })

    // 5. Limpar rascunho e mostrar sucesso
    clearDraft()
    showSuccess()

  } catch (err) {
    console.error('Erro ao enviar formulário:', err)
    showMessage(
      msgEl,
      'Ocorreu um erro ao enviar. Verifique sua conexão e tente novamente.',
      'error'
    )
  } finally {
    setLoading(btn, false)
  }
}

// ── Helpers de UI ─────────────────────────────────────────────
function setLoading(btn, loading) {
  if (!btn) return
  btn.disabled = loading
  btn.textContent = loading ? 'Enviando...' : 'Enviar formulário'
}

function showMessage(el, text, type) {
  if (!el) return
  el.textContent = text
  el.className = `form-message form-message--${type}`
  el.classList.remove('hidden')
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function clearMessage(el) {
  if (!el) return
  el.textContent = ''
  el.className = 'form-message hidden'
}

function showSuccess() {
  const overlay = document.getElementById('success-overlay')
  if (overlay) {
    overlay.classList.remove('hidden')
    overlay.scrollIntoView({ behavior: 'smooth' })
  }

  // Limpar formulário
  const form = document.getElementById('main-form')
  if (form) form.reset()
}
