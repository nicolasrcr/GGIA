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
let _drillCache = null   // cache para drill-down (todos os participantes, sem paginação)

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
      borderWidth: 1,
    }]
  }, {
    plugins: {
      legend: { position: 'bottom' },
      datalabels: {
        formatter: (value, ctx) => {
          const total = ctx.dataset.data.reduce((a, b) => +a + +b, 0)
          const pct = Math.round(value / total * 100)
          return pct >= 5 ? pct + '%' : ''
        },
        color: '#fff',
        font: { weight: 'bold', size: 11 },
      },
    },
  })
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
    plugins: { legend: { display: false }, datalabels: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    onClick: (e, els, chart) => { if (els.length) handleBarClick(chart.data.labels[els[0].index], 'skill') },
    onHover:  (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default' },
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
    plugins: { legend: { display: false }, datalabels: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    onClick: (e, els, chart) => { if (els.length) handleBarClick(chart.data.labels[els[0].index], 'frente') },
    onHover:  (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default' },
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
      borderWidth: 1,
    }]
  }, {
    plugins: {
      legend: { position: 'bottom' },
      datalabels: {
        formatter: (value, ctx) => {
          const total = ctx.dataset.data.reduce((a, b) => +a + +b, 0)
          const pct = Math.round(value / total * 100)
          return pct >= 5 ? pct + '%' : ''
        },
        color: '#fff',
        font: { weight: 'bold', size: 11 },
      },
    },
  })
}

async function loadChartCadastrosMes() {
  const { data } = await supabase
    .from('v_cadastros_por_mes')
    .select('*')
    .order('mes', { ascending: true })
    .limit(12)

  if (!data || !data.length) return

  renderChart('chart-cadastros-mes', 'line', {
    labels: data.map(r => new Date(r.mes).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })),
    datasets: [{
      label: 'Novos cadastros',
      data: data.map(r => r.total),
      borderColor: 'rgba(30, 58, 138, 1)',
      backgroundColor: 'rgba(30, 58, 138, 0.1)',
      tension: 0.3,
      fill: true,
    }]
  }, {
    plugins: { datalabels: { display: false } },
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
  const btn = document.getElementById('export-pdf')
  const origText = btn?.textContent
  if (btn) { btn.textContent = 'Gerando relatório...'; btn.disabled = true }

  try {
    const [
      participants,
      { data: titulacao },
      { data: skills },
      { data: frentes },
      { data: disponibilidade },
      { data: meses },
      { data: coordenadores },
    ] = await Promise.all([
      getFilteredData(),
      supabase.from('v_participantes_por_titulacao').select('*').limit(10),
      supabase.from('v_participantes_por_skill').select('*').order('total', { ascending: false }).limit(10),
      supabase.from('v_participantes_por_frente').select('*').order('total', { ascending: false }),
      supabase.from('v_disponibilidade_resumo').select('*'),
      supabase.from('v_cadastros_por_mes').select('*').order('mes'),
      supabase.from('v_potenciais_coordenadores').select('*'),
    ])

    if (!participants.length) { alert('Nenhum dado para exportar.'); return }

    const total         = participants.length
    const coordN        = participants.filter(p => p.interesse_coordenacao).length
    const titulacoesCnt = new Set(participants.map(p => p.titulacao).filter(Boolean)).size
    const vinculosCnt   = new Set(participants.map(p => p.vinculo_institucional).filter(Boolean)).size
    const dateStr       = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const filterInfo    = [
      filters.search          && `Busca: "${filters.search}"`,
      filters.titulacao       && `Titulação: ${filters.titulacao}`,
      filters.disponibilidade && `Disponibilidade: ${filters.disponibilidade}`,
      filters.interesse_coordenacao && `Coordenação: ${filters.interesse_coordenacao}`,
    ].filter(Boolean).join(' · ') || 'Todos os participantes ativos'

    const html = buildReportHTML({
      participants,
      titulacao:       titulacao       || [],
      skills:          skills          || [],
      frentes:         frentes         || [],
      disponibilidade: disponibilidade || [],
      meses:           meses           || [],
      coordenadores:   coordenadores   || [],
      total, coordN, titulacoesCnt, vinculosCnt, dateStr, filterInfo,
    })

    const win = window.open('', '_blank')
    if (!win) { alert('Permita popups para gerar o relatório.'); return }
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.focus(), 600)
  } catch (err) {
    alert('Erro ao gerar relatório: ' + err.message)
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false }
  }
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

// ── Relatório gerencial HTML (abre em nova aba para impressão PDF) ─────────
function buildReportHTML({ participants, titulacao, skills, frentes, disponibilidade, meses, coordenadores, total, coordN, titulacoesCnt, vinculosCnt, dateStr, filterInfo }) {
  const h = s => String(s || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const pct        = total > 0 ? Math.round(coordN / total * 100) : 0
  const topTitulacao = h(titulacao[0]?.titulacao || '—')
  const topSkill     = h(skills[0]?.skill || '—')
  const topFrente    = h(frentes[0]?.frente || '—')
  const now          = new Date().toLocaleString('pt-BR')

  const tableRows = participants.map((p, i) => `
    <tr class="${i % 2 === 0 ? 're' : 'ro'}">
      <td>${h(p.nome)}</td>
      <td>${h(p.titulacao)}</td>
      <td>${h(p.vinculo_institucional)}</td>
      <td>${h(p.disponibilidade)}</td>
      <td class="sm">${h(p.skills)}</td>
      <td class="sm">${h(p.frentes)}</td>
      <td class="tc">${p.interesse_coordenacao ? '<span class="by">✓ Sim</span>' : '—'}</td>
    </tr>`).join('')

  const coordRows = coordenadores.map((p, i) => `
    <tr class="${i % 2 === 0 ? 're' : 'ro'}">
      <td>${h(p.nome)}</td>
      <td>${h(p.titulacao)}</td>
      <td>${h(p.vinculo_institucional)}</td>
      <td>${h(p.disponibilidade)}</td>
      <td class="sm">${h(p.frentes)}</td>
    </tr>`).join('')

  const D = JSON.stringify({ titulacao, skills, frentes, disponibilidade, meses })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

  // ── Breakdown: categoria → lista de nomes ──────────────────
  const _match = (field, nome) => participants
    .filter(p => (p[field] || '').split(', ').map(s => s.trim().toLowerCase()).includes(nome.toLowerCase()))
    .map(p => h(p.nome))

  const _breakSection = (titulo, cor, items) => items.length === 0 ? '' : `
<div class="tp pb">
  <div class="sh"><h3 style="color:${cor}">${titulo}</h3></div>
  <table class="dt">
    <thead><tr>
      <th style="width:26%">Categoria</th>
      <th style="width:7%;text-align:center">Total</th>
      <th>Participantes</th>
    </tr></thead>
    <tbody>${items.map((it, i) => `
      <tr class="${i % 2 === 0 ? 're' : 'ro'}">
        <td style="font-weight:700;color:${cor};vertical-align:middle">${it.nome}</td>
        <td style="text-align:center;font-weight:900;font-size:13px;color:${cor};vertical-align:middle">${it.total}</td>
        <td>${it.pessoas.map(n => `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;margin:1px 3px;font-size:7.5px;white-space:nowrap">${n}</span>`).join('')}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="ft"><div><strong>GGIA</strong> · ${titulo}</div><div>${dateStr}</div></div>
</div>`

  const skillsSection  = _breakSection('Participantes por Área de Expertise', '#1e3a8a',
    skills.filter(s  => +s.total  > 0).map(s => ({ nome: s.skill,   total: +s.total,  pessoas: _match('skills',  s.skill)   })))

  const frentesSection = _breakSection('Participantes por Frente de Interesse', '#7f1d1d',
    frentes.filter(f => +f.total > 0).map(f => ({ nome: f.frente, total: +f.total, pessoas: _match('frentes', f.frente) })))

  const coordSection = coordenadores.length > 0 ? `
<div class="tp pb">
  <div class="sh"><h3 style="color:#7f1d1d">Potenciais Coordenadores</h3><span class="cnt" style="background:#7f1d1d">${coordenadores.length}</span></div>
  <table class="dt ctb">
    <thead><tr>
      <th style="width:22%">Nome</th><th style="width:13%">Titulação</th>
      <th style="width:20%">Vínculo Institucional</th><th style="width:14%">Disponibilidade</th>
      <th>Frentes de Interesse</th>
    </tr></thead>
    <tbody>${coordRows}</tbody>
  </table>
  <div class="ft"><div><strong>${coordenadores.length}</strong> participantes com interesse em coordenar frentes</div><div>GGIA · Uso interno · ${dateStr}</div></div>
</div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Gerencial GGIA — ${dateStr}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><` + `/script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"><` + `/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#eef0f3;color:#111827;font-size:11px}
@page{size:A4 portrait;margin:12mm 14mm}
@media print{body{background:#fff}.np{display:none!important}.pb{page-break-before:always}.ab{page-break-inside:avoid}}

/* Botões tela */
.np{position:fixed;top:14px;right:14px;z-index:999;display:flex;gap:8px;align-items:center}
.bp{background:#1e3a8a;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:13px;cursor:pointer;font-weight:700;box-shadow:0 2px 10px rgba(30,58,138,.35)}
.bc{background:#6b7280;color:#fff;border:none;padding:10px 16px;border-radius:7px;font-size:13px;cursor:pointer}
.bp:hover{background:#1d4ed8}.bc:hover{background:#4b5563}

/* Páginas */
.pg,.cp,.tp{background:#fff}

/* ── CAPA ── */
.ch{background:linear-gradient(135deg,#1e3a8a 0%,#1e1b4b 100%);color:#fff;padding:30px 32px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.ch-l h1{font-size:24px;font-weight:900;margin-bottom:5px;letter-spacing:-.3px}
.ch-l .sub{font-size:11px;color:rgba(255,255,255,.65);line-height:1.5}
.ch-r{text-align:right;flex-shrink:0}
.ch-r .bdg{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 14px;font-size:9px;color:rgba(255,255,255,.9);margin-bottom:6px;font-weight:600}
.ch-r .dt{font-size:9px;color:rgba(255,255,255,.5)}
.cb{padding:24px 32px 22px}
.ct{margin-bottom:18px}
.ct h2{font-size:18px;color:#1e3a8a;font-weight:800;margin-bottom:7px}
.ftag{display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:5px;padding:3px 10px;font-size:9px;font-weight:700}

/* KPIs */
.kg{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.kc{background:#fff;border-radius:10px;padding:16px 14px;border-left:4px solid #1e3a8a;box-shadow:0 1px 8px rgba(0,0,0,.1)}
.kc.g{border-left-color:#b45309}.kc.w{border-left-color:#7f1d1d}.kc.e{border-left-color:#065f46}
.kl{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:700;margin-bottom:6px}
.kv{font-size:32px;font-weight:900;color:#1e3a8a;line-height:1;margin-bottom:3px}
.kc.g .kv{color:#b45309}.kc.w .kv{color:#7f1d1d}.kc.e .kv{color:#065f46}
.ks{font-size:8px;color:#9ca3af}

/* Highlights */
.hl{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:18px}
.hlg{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.hll{font-weight:700;color:#374151;margin-bottom:3px;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em}
.hlv{color:#1e3a8a;font-weight:700;font-size:12px}

/* Seção header */
.sh{display:flex;align-items:center;gap:10px;border-bottom:3px solid #1e3a8a;padding-bottom:8px;margin-bottom:16px}
.sh h3{font-size:12px;font-weight:800;color:#1e3a8a;text-transform:uppercase;letter-spacing:.06em}
.cnt{background:#1e3a8a;color:#fff;border-radius:999px;padding:2px 9px;font-size:8.5px;font-weight:700}

/* Gráficos */
.cp{padding:24px 32px}
.cg2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.cg1{margin-bottom:14px}
.cbx{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:13px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.ctx{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151;margin-bottom:8px;border-bottom:1px solid #f3f4f6;padding-bottom:5px}
.csm{height:185px}.cmd{height:200px}.clg{height:158px}

/* Tabela */
.tp{padding:24px 32px}
.dt{width:100%;border-collapse:collapse;font-size:8.5px}
.dt thead th{background:#1e3a8a;color:#fff;padding:7px 8px;text-align:left;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:.04em}
.dt tbody td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top;line-height:1.45}
.re td{background:#fff}.ro td{background:#f9fafb}
.sm{font-size:8px}.tc{text-align:center}
.by{background:#d1fae5;color:#065f46;border-radius:3px;padding:1px 6px;font-weight:700;font-size:8px}
.ctb thead th{background:#7f1d1d}

/* Footer */
.ft{margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#9ca3af}
.ft strong{color:#6b7280}

@media screen{
  .pg,.cp,.tp{max-width:800px;margin:0 auto 20px;box-shadow:0 4px 24px rgba(0,0,0,.13)}
  body{padding:24px 16px 80px}
}
</style>
</head>
<body>

<div class="np">
  <button class="bp" onclick="window.print()">⬇ Salvar como PDF</button>
  <button class="bc" onclick="window.close()">✕ Fechar</button>
</div>

<!-- ═══════ CAPA ═══════ -->
<div class="pg ab">
  <div class="ch">
    <div class="ch-l">
      <h1>GGIA — Comitê</h1>
      <div class="sub">Grupo de Governança, Gestão e Inteligência Artificial<br>LabRisk / UnB · Brasília</div>
    </div>
    <div class="ch-r">
      <div class="bdg">CNPq Certificado</div>
      <div class="dt">${dateStr}</div>
    </div>
  </div>
  <div class="cb">
    <div class="ct">
      <h2>Relatório Gerencial — Mapeamento de Perfis</h2>
      <span class="ftag">📋 ${filterInfo}</span>
    </div>
    <div class="kg">
      <div class="kc">
        <div class="kl">Total de Participantes</div>
        <div class="kv">${total}</div>
        <div class="ks">membros ativos cadastrados</div>
      </div>
      <div class="kc g">
        <div class="kl">Interesse em Coordenar</div>
        <div class="kv">${coordN}</div>
        <div class="ks">${pct}% do total mapeado</div>
      </div>
      <div class="kc w">
        <div class="kl">Titulações Distintas</div>
        <div class="kv">${titulacoesCnt}</div>
        <div class="ks">categorias de formação</div>
      </div>
      <div class="kc e">
        <div class="kl">Vínculos Institucionais</div>
        <div class="kv">${vinculosCnt}</div>
        <div class="ks">instituições representadas</div>
      </div>
    </div>
    <div class="hl">
      <div class="hlg">
        <div><div class="hll">Titulação mais comum</div><div class="hlv">${topTitulacao}</div></div>
        <div><div class="hll">Área de expertise top</div><div class="hlv">${topSkill}</div></div>
        <div><div class="hll">Frente mais demandada</div><div class="hlv">${topFrente}</div></div>
      </div>
    </div>
    <div class="ft">
      <div><strong>GGIA — Comitê Científico</strong> · LabRisk / UnB · CNPq Certificado</div>
      <div>Gerado em ${now} · Uso interno</div>
    </div>
  </div>
</div>

<!-- ═══════ GRÁFICOS ═══════ -->
<div class="cp pb">
  <div class="sh"><h3>Análise dos Perfis</h3></div>
  <div class="cg2">
    <div class="cbx ab"><div class="ctx">Distribuição por Titulação</div><div class="csm"><canvas id="rpt-tit"></canvas></div></div>
    <div class="cbx ab"><div class="ctx">Disponibilidade de Tempo</div><div class="csm"><canvas id="rpt-disp"></canvas></div></div>
  </div>
  <div class="cg2">
    <div class="cbx ab"><div class="ctx">Áreas de Expertise (Top 10)</div><div class="cmd"><canvas id="rpt-sk"></canvas></div></div>
    <div class="cbx ab"><div class="ctx">Frentes de Interesse</div><div class="cmd"><canvas id="rpt-fr"></canvas></div></div>
  </div>
  <div class="cg1">
    <div class="cbx ab"><div class="ctx">Evolução de Cadastros por Mês</div><div class="clg"><canvas id="rpt-ms"></canvas></div></div>
  </div>
  <div class="ft">
    <div><strong>GGIA</strong> · Análise Quantitativa de Perfis · Dados em tempo real</div>
    <div>${dateStr}</div>
  </div>
</div>

<!-- ═══════ TABELA ═══════ -->
<div class="tp pb">
  <div class="sh"><h3>Listagem de Participantes</h3><span class="cnt">${total}</span></div>
  <table class="dt">
    <thead><tr>
      <th style="width:18%">Nome</th><th style="width:10%">Titulação</th>
      <th style="width:15%">Vínculo Institucional</th><th style="width:13%">Disponibilidade</th>
      <th style="width:19%">Áreas de Expertise</th><th style="width:19%">Frentes de Interesse</th>
      <th style="width:6%" class="tc">Coord.</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="ft">
    <div><strong>${total}</strong> participantes · ${filterInfo}</div>
    <div>GGIA — Uso interno · ${dateStr}</div>
  </div>
</div>

${coordSection}
${skillsSection}
${frentesSection}

<script>
const D=${D};
const P=['#1e3a8a','#7e22ce','#9a3412','#065f46','#b45309','#0e7490','#4d7c0f','#be185d','#374151','#92400e'];
const BASE={responsive:true,maintainAspectRatio:false,animation:{duration:0}};
const DLABELS={formatter:(v,ctx)=>{const t=ctx.dataset.data.reduce((a,b)=>+a+ +b,0);const p=Math.round(v/t*100);return p>=5?p+'%':'';},color:'#fff',font:{weight:'bold',size:10}};

if(D.titulacao.length)new Chart(document.getElementById('rpt-tit'),{
  type:'doughnut',
  data:{labels:D.titulacao.map(r=>r.titulacao),datasets:[{data:D.titulacao.map(r=>+r.total),backgroundColor:P,borderWidth:1}]},
  options:{...BASE,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:8}}},datalabels:DLABELS}}
});

if(D.disponibilidade.length)new Chart(document.getElementById('rpt-disp'),{
  type:'pie',
  data:{labels:D.disponibilidade.map(r=>r.disponibilidade),datasets:[{data:D.disponibilidade.map(r=>+r.total),backgroundColor:P,borderWidth:1}]},
  options:{...BASE,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:8}}},datalabels:DLABELS}}
});

if(D.skills.length)new Chart(document.getElementById('rpt-sk'),{
  type:'bar',
  data:{labels:D.skills.map(r=>r.skill),datasets:[{data:D.skills.map(r=>+r.total),backgroundColor:'rgba(30,58,138,.75)',borderRadius:3,borderSkipped:false}]},
  options:{...BASE,indexAxis:'y',plugins:{legend:{display:false},datalabels:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0,font:{size:8}}},y:{ticks:{font:{size:8}}}}}
});

if(D.frentes.length)new Chart(document.getElementById('rpt-fr'),{
  type:'bar',
  data:{labels:D.frentes.map(r=>r.frente),datasets:[{data:D.frentes.map(r=>+r.total),backgroundColor:'rgba(127,29,29,.75)',borderRadius:3,borderSkipped:false}]},
  options:{...BASE,indexAxis:'y',plugins:{legend:{display:false},datalabels:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0,font:{size:8}}},y:{ticks:{font:{size:8}}}}}
});

if(D.meses.length)new Chart(document.getElementById('rpt-ms'),{
  type:'line',
  data:{
    labels:D.meses.map(r=>new Date(r.mes).toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'})),
    datasets:[{data:D.meses.map(r=>+r.total),borderColor:'#1e3a8a',backgroundColor:'rgba(30,58,138,.1)',borderWidth:2,tension:.35,fill:true,pointRadius:3,pointBackgroundColor:'#1e3a8a'}]
  },
  options:{...BASE,plugins:{legend:{display:false},datalabels:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0,font:{size:8}}},x:{ticks:{font:{size:8}}}}}
});
<` + `/script>
</body></html>`
}

// ── Drill-down: clique nas barras ─────────────────────────────
async function handleBarClick(categoria, tipo) {
  // Busca e cacheia todos os participantes uma única vez
  if (!_drillCache) {
    const { data } = await supabase
      .from('v_participantes_resumo')
      .select('id, nome, email, titulacao, vinculo_institucional, disponibilidade, skills, frentes')
      .eq('active', true)
      .order('nome')
    _drillCache = data || []
  }

  const campo = tipo === 'skill' ? 'skills' : 'frentes'
  const resultados = _drillCache.filter(p => {
    const items = (p[campo] || '').split(', ').map(s => s.trim().toLowerCase())
    return items.includes(categoria.toLowerCase())
  })

  showDrilldownPanel(categoria, tipo, resultados)
}

function showDrilldownPanel(categoria, tipo, participantes) {
  document.getElementById('_dd-panel')?.remove()

  const tipoLabel = tipo === 'skill' ? 'Área de Expertise' : 'Frente de Interesse'
  const cor       = tipo === 'skill' ? '#1e3a8a' : '#7f1d1d'

  const rows = participantes.length
    ? participantes.map(p => `
        <tr>
          <td>${p.nome || '—'}</td>
          <td>${p.titulacao || '—'}</td>
          <td>${p.vinculo_institucional || '—'}</td>
          <td>${p.disponibilidade || '—'}</td>
          <td><a href="mailto:${p.email}" style="color:${cor}">${p.email}</a></td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280">Nenhum participante encontrado</td></tr>`

  // Injeta estilos uma única vez
  if (!document.getElementById('_dd-styles')) {
    const s = document.createElement('style')
    s.id = '_dd-styles'
    s.textContent = `
      #_dd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1200;cursor:pointer}
      #_dd-panel{position:fixed;right:0;top:0;bottom:0;width:min(600px,96vw);background:#fff;z-index:1201;display:flex;flex-direction:column;box-shadow:-6px 0 28px rgba(0,0,0,.18);animation:_dd-in .22s ease}
      @keyframes _dd-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
      ._dd-hdr{color:#fff;padding:20px 20px 16px;display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0}
      ._dd-tipo{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.65);font-weight:700;display:block;margin-bottom:3px}
      ._dd-titulo{font-size:1.1rem;font-weight:800;margin:0 0 6px}
      ._dd-cnt{display:inline-block;background:rgba(255,255,255,.2);border-radius:999px;padding:2px 10px;font-size:.76rem}
      ._dd-close{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;line-height:1;flex-shrink:0}
      ._dd-close:hover{background:rgba(255,255,255,.3)}
      ._dd-body{flex:1;overflow-y:auto;padding:0}
      ._dd-tbl{width:100%;border-collapse:collapse;font-size:.84rem}
      ._dd-tbl thead th{background:#f1f5f9;color:#374151;font-weight:700;font-size:.73rem;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:1}
      ._dd-tbl tbody td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:middle;color:#374151}
      ._dd-tbl tbody tr:hover td{background:#f8faff}
    `
    document.head.appendChild(s)
  }

  const overlay = document.createElement('div')
  overlay.id = '_dd-overlay'
  overlay.onclick = () => document.getElementById('_dd-panel')?.remove() || overlay.remove()

  const panel = document.createElement('div')
  panel.id = '_dd-panel'
  panel.innerHTML = `
    <div class="_dd-hdr" style="background:linear-gradient(135deg,${cor},${cor}cc)">
      <div>
        <span class="_dd-tipo">${tipoLabel}</span>
        <div class="_dd-titulo">${categoria}</div>
        <span class="_dd-cnt">${participantes.length} participante${participantes.length !== 1 ? 's' : ''}</span>
      </div>
      <button class="_dd-close" onclick="document.getElementById('_dd-panel')?.remove();document.getElementById('_dd-overlay')?.remove()">✕</button>
    </div>
    <div class="_dd-body">
      <table class="_dd-tbl">
        <thead><tr><th>Nome</th><th>Titulação</th><th>Vínculo</th><th>Disponibilidade</th><th>E-mail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`

  document.body.appendChild(overlay)
  document.body.appendChild(panel)
}

// ── Logout ────────────────────────────────────────────────────
function setupLogout() {
  const btn = document.getElementById('logout-btn')
  if (btn) btn.addEventListener('click', logout)
}
