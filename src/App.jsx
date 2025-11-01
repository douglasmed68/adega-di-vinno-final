/* Adega Di Vinno 2 - App.jsx (integrado ao Supabase) */
import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 10 } } })

function id(pref = '') {
  return pref + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export default function App() {
  const [user, setUser] = useState(null)
  const [data, setData] = useState({ vinhos: [], clientes: [], fornecedores: [], vendas: [], compras: [], financeiro: [] })
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const subs = useRef([])

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((e, s) => setUser(s?.user ?? null))
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    })()
    return () => listener?.subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setData({ vinhos: [], clientes: [], fornecedores: [], vendas: [], compras: [], financeiro: [] })
      setLoading(false)
      return
    }
    let mounted = true
    setLoading(true)
    async function fetchAll() {
      const owner = user.id
      const [vRes, cRes, fRes, vsRes, cpRes, fnRes] = await Promise.all([
        supabase.from('vinhos').select('*').eq('owner_id', owner),
        supabase.from('clientes').select('*').eq('owner_id', owner),
        supabase.from('fornecedores').select('*').eq('owner_id', owner),
        supabase.from('vendas').select('*').eq('owner_id', owner),
        supabase.from('compras').select('*').eq('owner_id', owner),
        supabase.from('financeiro').select('*').eq('owner_id', owner),
      ])
      if (!mounted) return
      setData({
        vinhos: vRes.data || [],
        clientes: cRes.data || [],
        fornecedores: fRes.data || [],
        vendas: vsRes.data || [],
        compras: cpRes.data || [],
        financeiro: fnRes.data || [],
      })
      setLoading(false)
    }
    fetchAll()
    const tables = ['vinhos', 'clientes', 'fornecedores', 'vendas', 'compras', 'financeiro', 'itens_venda', 'itens_compra']
    subs.current = tables.map(tbl =>
      supabase
        .channel('public:' + tbl)
        .on('postgres_changes', { event: '*', schema: 'public', table: tbl, filter: `owner_id=eq.${user.id}` }, payload =>
          handleRealtime(tbl, payload)
        )
        .subscribe()
    )
    return () => {
      mounted = false
      subs.current.forEach(s => s.unsubscribe && s.unsubscribe())
      subs.current = []
    }
  }, [user])

  function handleRealtime(table, payload) {
    const et = payload?.eventType || payload?.type || payload?.event
    const newRow = payload?.new || payload?.record || payload?.new_record
    const oldRow = payload?.old || payload?.old_record
    if (!et) return
    if (String(et).toLowerCase().includes('insert'))
      setData(d => ({ ...d, [table]: [...(d[table] || []), newRow] }))
    else if (String(et).toLowerCase().includes('update'))
      setData(d => ({ ...d, [table]: (d[table] || []).map(r => (r.id === newRow.id ? newRow : r)) }))
    else if (String(et).toLowerCase().includes('delete'))
      setData(d => ({ ...d, [table]: (d[table] || []).filter(r => r.id !== oldRow.id) }))
  }

  async function add(table, payload) {
    if (!user) throw new Error('not authenticated')
    payload.owner_id = user.id
    const { data, error } = await supabase.from(table).insert([payload]).select().single()
    if (error) throw error
    return data
  }

  async function remove(table, id) {
    if (!user) throw new Error('not authenticated')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return true
  }

  async function addVinho(v) {
    await add('vinhos', v)
    setMsg('Vinho adicionado')
  }

  async function delVinho(id) {
    await remove('vinhos', id)
    setMsg('Vinho removido')
  }

  async function addCliente(c) {
    await add('clientes', c)
    setMsg('Cliente adicionado')
  }

  async function addFornecedor(f) {
    await add('fornecedores', f)
    setMsg('Fornecedor adicionado')
  }

  async function registrarVenda({ items, clienteId }) {
    if (!items || items.length === 0) throw new Error('Nenhum item')
    const owner = user.id
    const { data: venda, error: e1 } = await supabase
      .from('vendas')
      .insert([{ owner_id: owner, cliente_id: clienteId || null }])
      .select()
      .single()
    if (e1) throw e1
    const itens = items.map(it => ({
      owner_id: owner,
      venda_id: venda.id,
      vinho_id: it.wineId,
      quantidade: it.qty,
      preco_unitario: it.price,
    }))
    const { error: e2 } = await supabase.from('itens_venda').insert(itens)
    if (e2) throw e2
    const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
    await supabase.from('vendas').update({ total }).eq('id', venda.id)
    await add('financeiro', { tipo: 'entrada', descricao: `Venda ${venda.id}`, valor: total })
    setMsg('Venda registrada')
  }

  async function registrarCompra({ items, fornecedorId }) {
    if (!items || items.length === 0) throw new Error('Nenhum item')
    const owner = user.id
    const { data: compra, error: e1 } = await supabase
      .from('compras')
      .insert([{ owner_id: owner, fornecedor_id: fornecedorId || null }])
      .select()
      .single()
    if (e1) throw e1
    const itens = items.map(it => ({
      owner_id: owner,
      compra_id: compra.id,
      vinho_id: it.wineId,
      quantidade: it.qty,
      preco_custo: it.cost,
    }))
    const { error: e2 } = await supabase.from('itens_compra').insert(itens)
    if (e2) throw e2
    const total = itens.reduce((s, i) => s + i.quantidade * i.preco_custo, 0)
    await supabase.from('compras').update({ total }).eq('id', compra.id)
    await add('financeiro', { tipo: 'saída', descricao: `Compra ${compra.id}`, valor: total })
    setMsg('Compra registrada')
  }

  async function signUp(email, password) {
    const res = await supabase.auth.signUp({ email, password })
    if (res.error) throw res.error
    setMsg('Verifique seu e-mail')
  }

  async function signIn(email, password) {
    const res = await supabase.auth.signInWithPassword({ email, password })
    if (res.error) throw res.error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMsg('Você saiu')
  }

  if (!user) return <AuthScreen onSignIn={signIn} onSignUp={signUp} />
  if (loading) return <div className="container"><div className="small">Carregando...</div></div>

  const valorEstoque = data.vinhos
    .reduce((s, v) => s + (v.estoque || 0) * Number(v.preco_venda || 0), 0)
    .toFixed(2)

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Adega Di Vinno</h1>
          <div className="small">Usuário: {user.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setMsg(null)}>Limpar</button>
          <button className="btn" onClick={async () => { await signOut() }}>Sair</button>
        </div>
      </header>

      {msg && (
        <div style={{ marginTop: 12, padding: 8, background: '#ecfdf5', border: '1px solid #bbf7d0' }}>
          {msg}
        </div>
      )}

      <nav style={{ marginTop: 16 }}>
        {['dashboard', 'vinhos', 'clientes', 'fornecedores', 'vendas', 'compras', 'financeiro', 'config'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ marginRight: 8 }} className="btn">
            {t.toUpperCase()}
          </button>
        ))}
      </nav>

      <main style={{ marginTop: 20 }}>
        {tab === 'dashboard' && (
          <div>
            <h2>Painel</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div style={{ padding: 12, border: '1px solid #eee' }}>
                <div className="small">Valor em estoque</div>
                <div style={{ fontWeight: 700 }}>R$ {valorEstoque}</div>
              </div>
              <div style={{ padding: 12, border: '1px solid #eee' }}>
                <div className="small">Clientes</div>
                <div style={{ fontWeight: 700 }}>{data.clientes.length}</div>
              </div>
              <div style={{ padding: 12, border: '1px solid #eee' }}>
                <div className="small">Fornecedores</div>
                <div style={{ fontWeight: 700 }}>{data.fornecedores.length}</div>
              </div>
            </div>
          </div>
        )}
        {tab === 'vinhos' && <VinhosView vinhos={data.vinhos} fornecedores={data.fornecedores} onAdd={addVinho} onDelete={delVinho} />}
        {tab === 'clientes' && <ClientesView clientes={data.clientes} onAdd={addCliente} />}
        {tab === 'fornecedores' && <FornecedoresView fornecedores={data.fornecedores} onAdd={addFornecedor} />}
        {tab === 'vendas' && <VendasView vinhos={data.vinhos} clientes={data.clientes} onRegister={registrarVenda} />}
        {tab === 'compras' && <ComprasView vinhos={data.vinhos} fornecedores={data.fornecedores} onRegister={registrarCompra} />}
        {tab === 'financeiro' && <FinanceiroView financeiro={data.financeiro} />}
        {tab === 'config' && <div><h3>Configurações</h3><p className="small">Conecte seu Supabase nas variáveis de ambiente.</p></div>}
      </main>
    </div>
  )
}

/* --- COMPONENTE FINANCEIRO --- */
function FinanceiroView({ financeiro }) {
  return (
    <div>
      <h2>Financeiro</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Descrição</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {financeiro.map(f => (
            <tr key={f.id}>
              <td>{f.tipo}</td>
              <td>{f.descricao}</td>
              <td>R$ {Number(f.valor || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


