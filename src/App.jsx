/* Adega Di Vinno 2 - App.jsx (integrado ao Supabase) */
import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 10 } } })
function id(pref=''){ return pref + Date.now().toString(36) + Math.random().toString(36).slice(2,8) }
export default function App(){
  const [user,setUser]=useState(null); const [data,setData]=useState({ vinhos:[], clientes:[], fornecedores:[], vendas:[], compras:[], financeiro:[] });
  const [tab,setTab]=useState('dashboard'); const [loading,setLoading]=useState(true); const [msg,setMsg]=useState(null); const subs=useRef([])
  useEffect(()=>{ const { data: listener } = supabase.auth.onAuthStateChange((e,s)=> setUser(s?.user ?? null)); (async ()=>{ const { data:{ session } } = await supabase.auth.getSession(); setUser(session?.user ?? null) })(); return ()=> listener?.subscription?.unsubscribe() },[])
  useEffect(()=>{ if(!user){ setData({ vinhos:[], clientes:[], fornecedores:[], vendas:[], compras:[], financeiro:[] }); setLoading(false); return } let mounted=True; setLoading(true); async function fetchAll(){ const owner=user.id; const [vRes,cRes,fRes,vsRes,cpRes,fnRes]= await Promise.all([ supabase.from('vinhos').select('*').eq('owner_id',owner), supabase.from('clientes').select('*').eq('owner_id',owner), supabase.from('fornecedores').select('*').eq('owner_id',owner), supabase.from('vendas').select('*').eq('owner_id',owner), supabase.from('compras').select('*').eq('owner_id',owner), supabase.from('financeiro').select('*').eq('owner_id',owner) ]); if(!mounted) return; setData({ vinhos: vRes.data||[], clientes: cRes.data||[], fornecedores: fRes.data||[], vendas: vsRes.data||[], compras: cpRes.data||[], financeiro: fnRes.data||[] }); setLoading(false) } fetchAll(); const tables=['vinhos','clientes','fornecedores','vendas','compras','financeiro','itens_venda','itens_compra']; subs.current = tables.map(tbl => supabase.channel('public:'+tbl).on('postgres_changes',{ event:'*', schema:'public', table:tbl, filter:`owner_id=eq.${user.id}` }, payload => handleRealtime(tbl,payload)).subscribe()); return ()=>{ mounted=false; subs.current.forEach(s=>s.unsubscribe && s.unsubscribe()); subs.current=[] } },[user])
  function handleRealtime(table,payload){ const et=payload?.eventType||payload?.type||payload?.event; const newRow=payload?.new||payload?.record||payload?.new_record; const oldRow=payload?.old||payload?.old_record; if(!et) return; if(String(et).toLowerCase().includes('insert')) setData(d=>({...d, [table]:[...(d[table]||[]), newRow]})); else if(String(et).toLowerCase().includes('update')) setData(d=>({...d, [table]:(d[table]||[]).map(r=> r.id===newRow.id? newRow : r)})); else if(String(et).toLowerCase().includes('delete')) setData(d=>({...d, [table]:(d[table]||[]).filter(r=>r.id!==oldRow.id)})) }
  async function add(table,payload){ if(!user) throw new Error('not authenticated'); payload.owner_id = user.id; const { data, error } = await supabase.from(table).insert([payload]).select().single(); if(error) throw error; return data }
  async function remove(table,id){ if(!user) throw new Error('not authenticated'); const { error } = await supabase.from(table).delete().eq('id', id); if(error) throw error; return true }
  async function addVinho(v){ await add('vinhos', v); setMsg('Vinho adicionado') }
  async function delVinho(id){ await remove('vinhos', id); setMsg('Vinho removido') }
  async function addCliente(c){ await add('clientes', c); setMsg('Cliente adicionado') }
  async function addFornecedor(f){ await add('fornecedores', f); setMsg('Fornecedor adicionado') }
  async function registrarVenda({ items, clienteId }){ if(!items||items.length===0) throw new Error('Nenhum item'); const owner=user.id; const { data: venda, error: e1 } = await supabase.from('vendas').insert([{ owner_id: owner, cliente_id: clienteId || null }]).select().single(); if(e1) throw e1; const itens = items.map(it=>({ owner_id: owner, venda_id: venda.id, vinho_id: it.wineId, quantidade: it.qty, preco_unitario: it.price })); const { data:its, error: e2 } = await supabase.from('itens_venda').insert(itens).select(); if(e2) throw e2; const total = itens.reduce((s,i)=>s + (i.quantidade * i.preco_unitario),0); await supabase.from('vendas').update({ total }).eq('id', venda.id); await add('financeiro', { tipo: 'entrada', descricao: `Venda ${venda.id}`, valor: total }); setMsg('Venda registrada') }
  async function registrarCompra({ items, fornecedorId }){ if(!items||items.length===0) throw new Error('Nenhum item'); const owner=user.id; const { data: compra, error: e1 } = await supabase.from('compras').insert([{ owner_id: owner, fornecedor_id: fornecedorId || null }]).select().single(); if(e1) throw e1; const itens = items.map(it=>({ owner_id: owner, compra_id: compra.id, vinho_id: it.wineId, quantidade: it.qty, preco_custo: it.cost })); const { data:its, error: e2 } = await supabase.from('itens_compra').insert(itens).select(); if(e2) throw e2; const total = itens.reduce((s,i)=>s + (i.quantidade * i.preco_custo),0); await supabase.from('compras').update({ total }).eq('id', compra.id); await add('financeiro', { tipo: 'saída', descricao: `Compra ${compra.id}`, valor: total }); setMsg('Compra registrada') }
  async function signUp(email,password){ const res = await supabase.auth.signUp({ email, password }); if(res.error) throw res.error; setMsg('Verifique seu e-mail'); }
  async function signIn(email,password){ const res = await supabase.auth.signInWithPassword({ email, password }); if(res.error) throw res.error }
  async function signOut(){ await supabase.auth.signOut(); setMsg('Você saiu') }
  if(!user) return <AuthScreen onSignIn={signIn} onSignUp={signUp} />; if(loading) return <div className="container"><div className="small">Carregando...</div></div>
  const valorEstoque = data.vinhos.reduce((s,v)=>(s + ((v.estoque||0) * (Number(v.preco_venda || 0)))),0).toFixed(2)
  return (<div className="container"><header className="header"><div><h1>Adega Di Vinno</h1><div className="small">Usuário: {user.email}</div></div><div style={{display:'flex',gap:8}}><button className="btn" onClick={()=>setMsg(null)}>Limpar</button><button className="btn" onClick={async ()=>{ await signOut() }}>Sair</button></div></header>{msg && <div style={{marginTop:12,padding:8,background:'#ecfdf5',border:'1px solid #bbf7d0'}}>{msg}</div>}<nav style={{marginTop:16}}>{['dashboard','vinhos','clientes','fornecedores','vendas','compras','financeiro','config'].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{marginRight:8}} className="btn">{t.toUpperCase()}</button>))}</nav><main style={{marginTop:20}}>{tab==='dashboard' && (<div><h2>Painel</h2><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}><div style={{padding:12,border:'1px solid #eee'}}><div className="small">Valor em estoque</div><div style={{fontWeight:700}}>R$ {valorEstoque}</div></div><div style={{padding:12,border:'1px solid #eee'}}><div className="small">Clientes</div><div style={{fontWeight:700}}>{data.clientes.length}</div></div><div style={{padding:12,border:'1px solid #eee'}}><div className="small">Fornecedores</div><div style={{fontWeight:700}}>{data.fornecedores.length}</div></div></div></div>)}{tab==='vinhos' && <VinhosView vinhos={data.vinhos} fornecedores={data.fornecedores} onAdd={addVinho} onDelete={delVinho} />}{tab==='clientes' && <ClientesView clientes={data.clientes} onAdd={addCliente} />}{tab==='fornecedores' && <FornecedoresView fornecedores={data.fornecedores} onAdd={addFornecedor} />}{tab==='vendas' && <VendasView vinhos={data.vinhos} clientes={data.clientes} onRegister={registrarVenda} />}{tab==='compras' && <ComprasView vinhos={data.vinhos} fornecedores={data.fornecedores} onRegister={registrarCompra} />}{tab==='financeiro' && <FinanceiroView financeiro={data.financeiro} />}{tab==='config' && <div><h3>Configurações</h3><p className="small">Conecte seu Supabase nas variáveis de ambiente.</p></div>}</main></div>) }
function AuthScreen({ onSignIn, onSignUp }){ const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [mode,setMode]=useState('signin'); async function submit(e){ e.preventDefault(); try{ if(mode==='signin') await onSignIn(email,password); else await onSignUp(email,password) }catch(err){ alert(err.message||JSON.stringify(err)) } } return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}><form onSubmit={submit} style={{width:360,padding:20,background:'#fff',border:'1px solid #eee',borderRadius:8}}><h2>Adega Di Vinno - Entrar</h2><div style={{marginBottom:8}}><label className='small'>E-mail</label><input className='input' value={email} onChange={e=>setEmail(e.target.value)} /></div><div style={{marginBottom:8}}><label className='small'>Senha</label><input type='password' className='input' value={password} onChange={e=>setPassword(e.target.value)} /></div><div style={{display:'flex',gap:8}}><button className='btn' type='submit'>{mode==='signin'?'Entrar':'Cadastrar'}</button><button type='button' className='btn' onClick={()=>setMode(m=> m==='signin'?'signup':'signin')}>{mode==='signin'?'Criar conta':'Tenho conta'}</button></div></form></div>) }
function VinhosView({ vinhos, fornecedores, onAdd, onDelete }){ const [form,setForm]=useState({ nome:'', codigo_barras:'', custo:0, preco_venda:0, estoque:0, fornecedor_id:null }); function handleAdd(e){ e.preventDefault(); onAdd(form); setForm({ nome:'', codigo_barras:'', custo:0, preco_venda:0, estoque:0, fornecedor_id:null }) } return (<div><h2>Vinhos</h2><form onSubmit={handleAdd} style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}><input className='input' placeholder='Nome' value={form.nome} onChange={e=>setForm(f=>({...f, nome:e.target.value}))} /><input className='input' placeholder='Código EAN/GTIN' value={form.codigo_barras} onChange={e=>setForm(f=>({...f, codigo_barras:e.target.value}))} /><input className='input' type='number' placeholder='Estoque' value={form.estoque} onChange={e=>setForm(f=>({...f, estoque:Number(e.target.value)}))} /><input className='input' type='number' placeholder='Custo (R$)' value={form.custo} onChange={e=>setForm(f=>({...f, custo:Number(e.target.value)}))} /><input className='input' type='number' placeholder='Preço venda (R$)' value={form.preco_venda} onChange={e=>setForm(f=>({...f, preco_venda:Number(e.target.value)}))} /><select className='input' value={form.fornecedor_id||''} onChange={e=>setForm(f=>({...f, fornecedor_id: e.target.value || null}))}><option value=''>Fornecedor</option>{fornecedores.map(fr=>(<option key={fr.id} value={fr.id}>{fr.nome}</option>))}</select><div style={{gridColumn:'1 / -1'}}><button className='btn' type='submit'>Adicionar Vinho</button></div></form><table className='table' style={{marginTop:12}}><thead><tr><th>Nome</th><th>Estoque</th><th>Preço</th><th>Custo</th><th>Margem</th><th>Código</th><th></th></tr></thead><tbody>{vinhos.map(v=>{ const margem = ((Number(v.preco_venda||0) - Number(v.custo||0)) / (Number(v.custo||1)) * 100).toFixed(1); return (<tr key={v.id}><td>{v.nome}</td><td>{v.estoque}</td><td>R$ {Number(v.preco_venda||0).toFixed(2)}</td><td>R$ {Number(v.custo||0).toFixed(2)}</td><td>{isFinite(margem)? margem + '%':'-'}</td><td>{v.codigo_barras}</td><td><button className='btn' onClick={()=>{ if(confirm('Remover?')) onDelete(v.id) }}>Remover</button></td></tr>) })}</tbody></table></div>) }
function ClientesView({ clientes, onAdd }){ const [form,setForm]=useState({ nome:'', telefone:'', email:'' }); function handleAdd(e){ e.preventDefault(); onAdd(form); setForm({ nome:'', telefone:'', email:'' }) } return (<div><h2>Clientes</h2><form onSubmit={handleAdd} style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}><input className='input' placeholder='Nome' value={form.nome} onChange={e=>setForm(f=>({...f, nome:e.target.value}))} /><input className='input' placeholder='Telefone' value={form.telefone} onChange={e=>setForm(f=>({...f, telefone:e.target.value}))} /><input className='input' placeholder='E-mail' value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} /><div style={{gridColumn:'1 / -1'}}><button className='btn' type='submit'>Adicionar Cliente</button></div></form><ul style={{marginTop:12}}>{clientes.map(c=>(<li key={c.id} style={{padding:8,borderBottom:'1px solid #eee'}}><strong>{c.nome}</strong> — <span className='small'>{c.email} {c.telefone}</span></li>))}</ul></div>) }
function FornecedoresView({ fornecedores, onAdd }){ const [form,setForm]=useState({ nome:'', telefone:'', email:'' }); function handleAdd(e){ e.preventDefault(); onAdd(form); setForm({ nome:'', telefone:'', email':'' }) } return (<div><h2>Fornecedores</h2><form onSubmit={handleAdd} style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}><input className='input' placeholder='Nome' value={form.nome} onChange={e=>setForm(f=>({...f, nome:e.target.value}))} /><input className='input' placeholder='Telefone' value={form.telefone} onChange={e=>setForm(f=>({...f, telefone:e.target.value}))} /><input className='input' placeholder='E-mail' value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} /><div style={{gridColumn:'1 / -1'}}><button className='btn' type='submit'>Adicionar Fornecedor</button></div></form><ul style={{marginTop:12}}>{fornecedores.map(f=>(<li key={f.id} style={{padding:8,borderBottom:'1px solid #eee'}}><strong>{f.nome}</strong> — <span className='small'>{f.email} {f.telefone}</span></li>))}</ul></div>) }
function VendasView({ vinhos, clientes, onRegister }) {
  const [items, setItems] = useState([]);
  const [clienteId, setClienteId] = useState('');

  function addItem(id) {
    const wine = vinhos.find(v => v.id === id);
    if (!wine) return;
    setItems(it => [
      ...it,
      {
        id: 'it_' + Math.random().toString(36).slice(2, 9),
        wineId: wine.id,
        name: wine.nome,
        qty: 1,
        price: wine.preco_venda || 0,
      },
    ]);
  }

  function updateItem(itId, changes) {
    setItems(it => it.map(i => (i.id === itId ? { ...i, ...changes } : i)));
  }

  function removeItem(itId) {
    setItems(it => it.filter(i => i.id !== itId));
  }

  async function submit() {
    try {
      await onRegister({ items, clienteId });
      setItems([]);
      setClienteId('');
    } catch (e) {
      alert(e.message || e);
    }
  }

  return (
    <div>
      <h2>Registrar Venda</h2>
      <div style={{ marginBottom: 8 }}>
        <label className="small">Cliente</label>
        <select
          className="input"
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
        >
          <option value="">Avulso</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="small">Adicionar produto</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          {vinhos.map(v => (
            <button
              key={v.id}
              className="btn"
              onClick={() => addItem(v.id)}
            >
              {v.nome} ({v.estoque || 0})
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3>Itens</h3>
        {items.map(i => (
          <div
            key={i.id}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: 8,
              borderBottom: '1px solid #eee',
            }}
          >
            <div style={{ flex: 1 }}>{i.name}</div>
            <input
              type="number"
              className="input"
              value={i.qty}
              onChange={e => updateItem(i.id, { qty: Number(e.target.value) })}
              style={{ width: 80 }}
            />
            <input
              type="number"
              className="input"
              value={i.price}
              onChange={e => updateItem(i.id, { price: Number(e.target.value) })}
              style={{ width: 120 }}
            />
            <div>R$ {(i.qty * i.price).toFixed(2)}</div>
            <button className="btn" onClick={() => removeItem(i.id)}>
              Remover
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="small">
          Total: R${' '}
          {items
            .reduce((s, i) => s + i.qty * i.price, 0)
            .toFixed(2)}
        </div>
        <button
          className="btn"
          onClick={submit}
          disabled={items.length === 0}
        >
          Registrar Venda
        </button>
      </div>
    </div>
  );
}

function ComprasView({ vinhos, fornecedores, onRegister }) {
  const [items, setItems] = useState([]);
  const [fornecedorId, setFornecedorId] = useState('');

  function addItem() {
    setItems(it => [
      ...it,
      {
        id: 'it_' + Math.random().toString(36).slice(2, 9),
        wineId: vinhos[0]?.id || null,
        name: '',
        qty: 1,
        cost: 0,
      },
    ]);
  }

  function updateItem(itId, changes) {
    setItems(it => it.map(i => (i.id === itId ? { ...i, ...changes } : i)));
  }

  function removeItem(itId) {
    setItems(it => it.filter(i => i.id !== itId));
  }

  async function submit() {
    try {
      await onRegister({ items, fornecedorId });
      setItems([]);
      setFornecedorId('');
    } catch (e) {
      alert(e.message || e);
    }
  }

  return (
    <div>
      <h2>Registrar Compra</h2>
      <div style={{ marginBottom: 8 }}>
        <label className="small">Fornecedor</label>
        <select
          className="input"
          value={fornecedorId}
          onChange={e => setFornecedorId(e.target.value)}
        >
          <option value="">Avulso</option>
          {fornecedores.map(f => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <button className="btn" onClick={addItem}>
          Adicionar item
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        {items.map(i => (
          <div
            key={i.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
              alignItems: 'center',
              padding: 8,
              borderBottom: '1px solid #eee',
            }}
          >
            <select
              className="input"
              value={i.wineId || ''}
              onChange={e => updateItem(i.id, { wineId: e.target.value })}
            >
              <option value="">Escolher vinho</option>
              {vinhos.map(v => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>

            <input
              className="input"
              placeholder="Nome (novo)"
              value={i.name}
              onChange={e => updateItem(i.id, { name: e.target.value })}
            />

            <input
              className="input"
              type="number"
              value={i.qty}
              onChange={e => updateItem(i.id, { qty: Number(e.target.value) })}
            />

            <input
              className="input"
              type="number"
              value={i.cost}
              onChange={e => updateItem(i.id, { cost: Number(e.target.value) })}
            />

            <button className="btn" onClick={() => removeItem(i.id)}>
              Remover
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="small">
          Total: R${' '}
          {items
            .reduce((s, i) => s + i.qty * i.cost, 0)
            .toFixed(2)}
        </div>
        <button
          className="btn"
          onClick={submit}
          disabled={items.length === 0}
        >
          Registrar Compra
        </button>
      </div>
    </div>
  );
}


def FinanceiroView(props): pass

