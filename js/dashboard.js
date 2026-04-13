// ============================================================
// js/dashboard.js — Dashboard: métricas, filtros, exportações
// ============================================================

import { supabase } from './supabase.js'
import { requireInternalUser, getUserRole, fillUserInfo, logout } from './auth.js'

// ── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireInternalUser()
  if (!user) return

  await fillUserInfo()

  const role = await getUserRole()

  // Ocultar botões de admin para coordenadores
  if (role !== 'administrativo') {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.remove())
  }

  await Promise.all([
    loadKPIs(),
    loadParticipantsTable(),
    loadChartTitulacao(),
    loadChartSkills(),
    loadChartFrentes(),
    loadChartDisponibilidade(),
    loadChartCadastrosMes(),
  ])

  setupFilters()
  setupExports(role)
  setupLogout()
})

// ── Estado de filtros ─────────────────────────────────────────
const filters = {
  search: '',
  titulacao: '',
  disponibilidade: '',
  interesse_coordenacao: '',
}

let allParticipants = []

// ── KPIs ──────────────────────────────────────────────────────
async function loadKPIs() {
  const { data: total }   = await supabase.from('participants').select('id', { count: 'exact', head: true }).eq('active', true)
  const { count: totalN } = await supabase.from('participants').select('*', { count: 'exact', head: true }).eq('active', true)

  const { data: coordCount } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
    .eq('interesse_coordenacao', true)

  const { count: coordN } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)
    .eq('interesse_coordenacao', true)

  setKPI('kpi-total',      totalN ?? 0)
  setKPI('kpi-coordenadores', coordN ?? 0)

  // Titulações distintas
  const { data: titulacoes } = await supabase
    .from('participants')
    .select('titulacao')
    .eq('active', true)
    .not('titulacao', 'is', null)

  const unique = new Set((titulacoes || []).map(r => r.titulacao))
  setKPI('kpi-titulacoes', unique.size)

  // Vínculos distintos
  const { data: vinculos } = await supabase
    .from('participants')
    .select('vinculo_institucional')
    .eq('active', true)
    .not('vinculo_institucional', 'is', null)

  const uniqueV = new Set((vinculos || []).map(r => r.vinculo_institucional))
  setKPI('kpi-vinculos', uniqueV.size)
}

function setKPI(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

// ── Tabela de participantes ───────────────────────────────────
async function loadParticipantsTable(offset = 0) {
  const PAGE_SIZE = 20

  let query = supabase
    .from('v_participantes_resumo')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (filters.search) {
    query = query.or(`nome.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
  }
  if (filters.titulacao) {
    query = query.eq('titulacao', filters.titulacao)
  }
  if (filters.disponibilidade) {
    query = query.eq('disponibilidade', filters.disponibilidade)
  }
  if (filters.interesse_coordenacao === 'sim') {
    query = query.eq('interesse_coordenacao', true)
  } else if (filters.interesse_coordenacao === 'nao') {
    query = query.eq('interesse_coordenacao', false)
  }

  const { data, error } = await query

  if (error) {
    console.error('Erro ao carregar participantes:', error)
    return
  }

  allParticipants = data || []
  renderTable(allParticipants)
}

function renderTable(rows) {
  const tbody = document.querySelector('#participants-table tbody')
  const empty = document.getElementById('table-empty')
  if (!tbody) return

  if (!rows || rows.length === 0) {
    tbody.innerHTML = ''
    if (empty) empty.classList.remove('hidden')
    return
  }

  if (empty) empty.classList.add('hidden')

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td>${esc(p.nome)}</td>
      <td>${esc(p.email)}</td>
      <td>${esc(p.formacao || '—')}</td>
      <td>${esc(p.titulacao || '—')}</td>
      <td>${esc(p.vinculo_institucional || '—')}</td>
      <td>${esc(p.disponibilidade || '—')}</td>
      <td class="text-center">${p.interesse_coordenacao ? '<span class="badge badge--yes">Sim</span>' : '<span class="badge badge--no">Não</span>'}</td>
    </tr>
  `).join('')
}

function esc(str) {
  if (!str) return '—'
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Filtros ───────────────────────────────────────────────────
function setupFilters() {
  const searchInput = document.getElementById('filter-search')
  const titulacaoSel = document.getElementById('filter-titulacao')
  const dispSel      = document.getElementById('filter-disponibilidade')
  const coordSel     = document.getElementById('filter-coordenacao')
  const clearBtn     = document.getElementById('filter-clear')

  if (searchInput) {
    let timer
    searchInput.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        filters.search = searchInput.value.trim()
        loadParticipantsTable()
      }, 400)
    })
  }

  if (titulacaoSel) {
    titulacaoSel.addEventListener('change', () => {
      filters.titulacao = titulacaoSel.value
      loadParticipantsTable()
    })
  }

  if (dispSel) {
    dispSel.addEventListener('change', () => {
      filters.disponibilidade = dispSel.value
      loadParticipantsTable()
    })
  }

  if (coordSel) {
    coordSel.addEventListener('change', () => {
      filters.interesse_coordenacao = coordSel.value
      loadParticipantsTable()
    })
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filters.search = ''
      filters.titulacao = ''
      filters.disponibilidade = ''
      filters.interesse_coordenacao = ''
      if (searchInput) searchInput.value = ''
      if (titulacaoSel) titulacaoSel.value = ''
      if (dispSel) dispSel.value = ''
      if (coordSel) coordSel.value = ''
      loadParticipantsTable()
    })
  }
}

// ── Gráficos (usando Chart.js via CDN) ───────────────────────
async function loadChartTitulacao() {
  const { data } = await supabase
    .from('v_participantes_por_titulacao')
    .select('*')
    .limit(10)

  if (!data || !data.length) return

  renderChart('chart-titulacao', 'doughnut', {
    labels: data.map(r => r.titulacao),
    datasets: [{
      data: data.map(r => r.total),
      backgroundColor: chartColors(data.length),
    }]
  }, { plugins: { legend: { position: 'bottom' } } })
}

async function loadChartSkills() {
  const { data } = await supabase
    .from('v_participantes_por_skill')
    .select('*')
    .limit(10)

  if (!data || !data.length) return

  renderChart('chart-skills', 'bar', {
    labels: data.map(r => r.skill),
    datasets: [{
      label: 'Participantes',
      data: data.map(r => r.total),
      backgroundColor: 'rgba(30, 58, 138, 0.75)',
      borderRadius: 4,
    }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
  })
}

async function loadChartFrentes() {
  const { data } = await supabase
    .from('v_participantes_por_frente')
    .select('*')

  if (!data || !data.length) return

  renderChart('chart-frentes', 'bar', {
    labels: data.map(r => r.frente),
    datasets: [{
      label: 'Participantes',
      data: data.map(r => r.total),
      backgroundColor: 'rgba(146, 64, 14, 0.75)',
      borderRadius: 4,
    }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
  })
}

async function loadChartDisponibilidade() {
  const { data } = await supabase
    .from('v_disponibilidade_resumo')
    .select('*')

  if (!data || !data.length) return

  renderChart('chart-disponibilidade', 'pie', {
    labels: data.map(r => r.disponibilidade),
    datasets: [{
      data: data.map(r => r.total),
      backgroundColor: chartColors(data.length),
    }]
  }, { plugins: { legend: { position: 'bottom' } } })
}

async function loadChartCadastrosMes() {
  const { data } = await supabase
    .from('v_cadastros_por_mes')
    .select('*')
    .order('mes', { ascending: true })
    .limit(12)

  if (!data || !data.length) return

  renderChart('chart-cadastros-mes', 'line', {
    labels: data.map(r => new Date(r.mes).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })),
    datasets: [{
      label: 'Novos cadastros',
      data: data.map(r => r.total),
      borderColor: 'rgba(30, 58, 138, 1)',
      backgroundColor: 'rgba(30, 58, 138, 0.1)',
      tension: 0.3,
      fill: true,
    }]
  }, {
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  })
}

function renderChart(canvasId, type, chartData, options = {}) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js não carregado.')
    return
  }

  new Chart(canvas, {
    type,
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...options,
    }
  })
}

function chartColors(n) {
  const palette = [
    '#1e3a8a', '#7e22ce', '#9a3412', '#065f46', '#b45309',
    '#0e7490', '#4d7c0f', '#be185d', '#374151', '#92400e'
  ]
  return Array.from({ length: n }, (_, i) => palette[i % palette.length])
}

// ── Exportações ───────────────────────────────────────────────
function setupExports(role) {
  const excelBtn = document.getElementById('export-excel')
  const pdfBtn   = document.getElementById('export-pdf')

  if (excelBtn) {
    excelBtn.addEventListener('click', exportExcel)
  }
  if (pdfBtn) {
    pdfBtn.addEventListener('click', exportPDF)
  }
}

async function getFilteredData() {
  let query = supabase
    .from('v_participantes_resumo')
    .select('*')
    .order('nome')

  if (filters.search) {
    query = query.or(`nome.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
  }
  if (filters.titulacao) query = query.eq('titulacao', filters.titulacao)
  if (filters.disponibilidade) query = query.eq('disponibilidade', filters.disponibilidade)
  if (filters.interesse_coordenacao === 'sim') query = query.eq('interesse_coordenacao', true)
  else if (filters.interesse_coordenacao === 'nao') query = query.eq('interesse_coordenacao', false)

  const { data } = await query
  return data || []
}

async function exportExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX não carregada.')
    return
  }

  const data = await getFilteredData()
  if (!data.length) { alert('Nenhum dado para exportar.'); return }

  const rows = data.map(p => ({
    'Nome': p.nome,
    'E-mail': p.email,
    'WhatsApp': p.whatsapp || '',
    'Cidade/UF': p.cidade_uf || '',
    'Vínculo': p.vinculo_institucional || '',
    'Formação': p.formacao || '',
    'Titulação': p.titulacao || '',
    'Disponibilidade': p.disponibilidade || '',
    'Modalidade': p.modalidade || '',
    'Interesse Coordenação': p.interesse_coordenacao ? 'Sim' : 'Não',
    'Skills': p.skills || '',
    'Frentes': p.frentes || '',
    'Cadastro': new Date(p.created_at).toLocaleDateString('pt-BR'),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes')
  XLSX.writeFile(wb, `GGIA_Participantes_${dateStamp()}.xlsx`)
}

async function exportPDF() {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    alert('Biblioteca jsPDF não carregada.')
    return
  }

  const data = await getFilteredData()
  if (!data.length) { alert('Nenhum dado para exportar.'); return }

  const { jsPDF } = window.jspdf || jspdf
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.text('GGIA — Participantes do Comitê', 14, 15)
  doc.setFontSize(9)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22)

  const head = [['Nome', 'E-mail', 'Titulação', 'Vínculo', 'Disponibilidade', 'Coord.', 'Frentes']]
  const body = data.map(p => [
    p.nome,
    p.email,
    p.titulacao || '—',
    p.vinculo_institucional || '—',
    p.disponibilidade || '—',
    p.interesse_coordenacao ? 'Sim' : 'Não',
    (p.frentes || '—').substring(0, 40),
  ])

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({ head, body, startY: 28, styles: { fontSize: 8 } })
  }

  doc.save(`GGIA_Participantes_${dateStamp()}.pdf`)
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

// ── Logout ────────────────────────────────────────────────────
function setupLogout() {
  const btn = document.getElementById('logout-btn')
  if (btn) btn.addEventListener('click', logout)
}
