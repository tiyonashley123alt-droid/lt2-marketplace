const API = '';
let products = [];
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
const $ = (s)=>document.querySelector(s);

function imgHtml(p, style){
  const im = p.image || '';
  const isImg = im && (im.startsWith('http') || im.startsWith('/'));
  if(!isImg) return im || '🌲';
  return `<img src="${im}" alt="${p.name}" loading="lazy"${style?` style="${style}"`:''}>`;
}

function saveCart(){ localStorage.setItem('cart', JSON.stringify(cart)); updateCart(); }

async function loadProducts(){
  try {
    const res = await fetch(API+'/api/products');
    products = await res.json();
  } catch(e){ products = []; }
  renderCats();
  renderGrid();
  renderFeatured();
  renderRecent();
  renderCatCards();
}

function categories(){ return ['All',...new Set(products.map(p=>p.category_name))]; }

function renderCats(active='All'){
  const el = document.getElementById('chips'); if(!el) return;
  el.innerHTML = categories().map(c=>`<button class="chip ${c===active?'active':''}" data-cat="${c}">${c}</button>`).join('');
  el.querySelectorAll('.chip').forEach(x=>x.onclick=()=>{ renderGrid(x.dataset.cat, document.getElementById('search').value); renderCats(x.dataset.cat); });
}

function renderGrid(cat='All', q=''){
  const el = document.getElementById('grid'); if(!el) return;
  let list = products;
  if(cat && cat!=='All') list = list.filter(p=>p.category_name===cat);
  if(q) list = list.filter(p=> (p.name+p.description).toLowerCase().includes(q.toLowerCase()));
  if(!list.length){ el.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">∅</div><h3>No items found</h3><p>Try adjusting your search or filters.</p></div>'; return; }
  el.innerHTML = list.map(p=>`
    <div class="card">
      <div class="imgwrap"><div class="img">${imgHtml(p)}</div></div>
      <div class="body">
        <div class="name">${p.name}</div>
        <div class="desc">${p.description}</div>
        <div class="price-row">
          <div class="price">${p.price===500000?'500K LT2 Money':'LT2$'+p.price.toLocaleString()}</div>
          <div class="avail"><span class="avail-dot ${p.available&&p.stock>0?'':'out'}"></span>${p.available?'In stock':'Unavailable'}</div>
        </div>
        <div class="actions">
          <button class="btn primary sm" onclick="openProduct(${p.id})">View</button>
          <button class="btn ghost sm" onclick="addToCart(${p.id})" ${!p.available||p.stock<=0?'disabled':''}>Add</button>
        </div>
      </div>
    </div>`).join('');
}

function renderFeatured(){
  const el = document.getElementById('grid'); // featured shares grid on homepage
  // Already rendered in grid; do nothing extra
}

function renderRecent(){
  const el = document.getElementById('recentGrid'); if(!el) return;
  const recent = [...products].slice(0,8);
  if(!recent.length){ el.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">∅</div><h3>No items yet</h3></div>'; return; }
  el.innerHTML = recent.map(p=>`
    <div class="card">
      <div class="imgwrap"><div class="img">${imgHtml(p)}</div></div>
      <div class="body">
        <div class="name">${p.name}</div>
        <div class="desc">${p.description}</div>
        <div class="price-row">
          <div class="price">${p.price===500000?'500K LT2 Money':'LT2$'+p.price.toLocaleString()}</div>
          <div class="avail"><span class="avail-dot ${p.available&&p.stock>0?'':'out'}"></span>${p.available?'In stock':'Unavailable'}</div>
        </div>
        <div class="actions">
          <button class="btn primary sm" onclick="openProduct(${p.id})">View</button>
          <button class="btn ghost sm" onclick="addToCart(${p.id})" ${!p.available||p.stock<=0?'disabled':''}>Add</button>
        </div>
      </div>
    </div>`).join('');
}

function renderCatCards(){
  const el = document.getElementById('catGrid'); if(!el) return;
  const cats = [...new Set(products.map(p=>p.category_name))];
  const icons = {'Axes':'🪓','Wood':'🪵','Vehicles':'🚗','Presents':'🎁','Collectibles':'⭐','Furniture':'🪑','Tools & Equipment':'🔧'};
  el.innerHTML = cats.slice(0,8).map(c=>{
    const count = products.filter(p=>p.category_name===c).length;
    return `<div class="cat-card" onclick="renderGrid('${c}','');document.getElementById('featured').scrollIntoView({behavior:'smooth'})">
      <div class="cat-card-icon">${icons[c]||'📦'}</div>
      <div class="cat-card-name">${c}</div>
      <div class="cat-card-count">${count} items</div>
    </div>`;
  }).join('');
}

let currentCat = 'All';

function openProduct(id){
  const p = products.find(x=>x.id===id);
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-img">${imgHtml(p, 'width:100%;height:100%;object-fit:contain')}</div>
    <p style="color:var(--text-2);margin-bottom:16px">${p.description}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><span style="color:var(--text-3);font-size:12px;text-transform:uppercase;letter-spacing:.08em">Category</span><div style="font-weight:600">${p.category_name}</div></div>
      <div><span style="color:var(--text-3);font-size:12px;text-transform:uppercase;letter-spacing:.08em">Availability</span><div style="font-weight:600">${p.available?'In stock ('+p.stock+')':'Unavailable'}</div></div>
    </div>
    <div class="modal-price">${p.price===500000?'500K LT2 Money':'LT2$'+p.price.toLocaleString()}</div>
    <button class="btn primary" style="width:100%" onclick="addToCart(${p.id});closeModal('productModal')">Add to Cart</button>`;
  document.getElementById('productModal').classList.add('show');
  document.getElementById('productModal').setAttribute('aria-hidden','false');
}

function closeModal(id){ document.getElementById(id).classList.remove('show'); document.getElementById(id).setAttribute('aria-hidden','true'); }

function addToCart(id){
  const p = products.find(x=>x.id===id);
  const ex = cart.find(c=>c.id===id);
  if(ex) ex.qty++; else cart.push({id,qty:1});
  saveCart();
  toast(p.name+' added to cart');
}

function updateCart(){
  const count = cart.reduce((a,c)=>a+c.qty,0);
  const cc = document.getElementById('cartCount');
  if(cc){ cc.textContent = count; cc.style.display = count>0?'flex':'none'; }
  const el = document.getElementById('cartBody');
  if(!el) return;
  if(!cart.length){ el.innerHTML='<div class="empty"><div class="empty-icon">🛒</div><h3>Cart is empty</h3><p>Add items to get started.</p></div>'; document.getElementById('cartTotal').textContent='LT2$0'; return; }
  el.innerHTML = cart.map(c=>{
    const p = products.find(x=>x.id===c.id) || {};
    return `<div class="cartitem">
      <div class="ci-img">${imgHtml(p, 'width:100%;height:100%;object-fit:contain;border-radius:8px')}</div>
      <div class="ci-info">
        <div class="ci-name">${p.name||'Item'}</div>
        <div class="ci-price">${p.price===500000?(c.qty*500)+'K LT2 Money':'LT2$'+(p.price*c.qty).toLocaleString()}</div>
        <div class="ci-qty">
          <button class="qty-btn" onclick="changeQty(${c.id},-1)">−</button><span>${c.qty}</span><button class="qty-btn" onclick="changeQty(${c.id},1)">+</button>
          <span class="ci-remove" onclick="removeItem(${c.id})">Remove</span>
        </div>
      </div>
    </div>`;
  }).join('');
  const total = cart.reduce((a,c)=>{const p=products.find(x=>x.id===c.id);return a+(p?p.price:0)*c.qty;},0);
  document.getElementById('cartTotal').textContent = 'LT2$'+total.toLocaleString();
}

function changeQty(id,d){ const c=cart.find(x=>x.id===id); if(!c) return; c.qty+=d; if(c.qty<=0) cart=cart.filter(x=>x.id!==id); saveCart(); }
function removeItem(id){ cart=cart.filter(x=>x.id!==id); saveCart(); }

function openCart(){ document.getElementById('cartDrawer').classList.add('open'); document.getElementById('backdrop').classList.add('show'); document.getElementById('cartDrawer').setAttribute('aria-hidden','false'); }
function closeCart(){ document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('backdrop').classList.remove('show'); document.getElementById('cartDrawer').setAttribute('aria-hidden','true'); }

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(window._t); window._t=setTimeout(()=>t.classList.remove('show'),2200); }

// Checkout
function openCheckout(){
  if(!cart.length){ toast('Cart is empty'); return; }
  closeCart();
  const total = cart.reduce((a,c)=>{const p=products.find(x=>x.id===c.id);return a+(p?p.price:0)*c.qty;},0);
  document.getElementById('checkoutBody').innerHTML = `
    <div class="order-summary"><h3>Order Summary</h3>`+
    cart.map(c=>{const p=products.find(x=>x.id===c.id);return `<div class="row"><span>${p.name} × ${c.qty}</span><span>LT2$${(p.price*c.qty).toLocaleString()}</span></div>`;}).join('')+
    `<div class="row total"><span>Total</span><span>LT2$${total.toLocaleString()}</span></div></div>
    <div class="checkout-form">
      <div class="field"><label>Roblox Username *</label><input id="robloxUser" required placeholder="Your Roblox username"></div>
      <div class="field"><label>Discord Username (optional)</label><input id="discordUser" placeholder="Your Discord tag"></div>
      <h3 style="margin-top:8px">Payment Method</h3>
      <div class="pay-option disabled" id="robuxOpt"><span class="radio"></span><span>Robux</span><span style="margin-left:auto;font-size:12px;color:var(--text-3)">Unavailable</span></div>
      <div class="pay-option" id="cardOpt" data-method="card"><span class="radio"></span><span>Credit / Debit Card (Square)</span><span style="margin-left:auto;font-size:12px;color:var(--text-3)">→</span></div>
      <div class="pay-option" id="lt2Opt" data-method="lt2money"><span class="radio"></span><span>LT2 Money (In-game)</span><span style="margin-left:auto;font-size:12px;color:var(--text-3)">→</span></div>
      <button id="submitOrder" class="btn primary" style="width:100%;margin-top:8px">Place Order</button>
    </div>`;
  document.getElementById('checkoutModal').classList.add('show');
  document.getElementById('checkoutModal').setAttribute('aria-hidden','false');

  document.getElementById('robuxOpt').onclick = () => alert('Payment Option Unavailable\n\nThis payment option is currently unavailable. Please select another payment method.');
  let method = null;
  document.querySelectorAll('.pay-option[data-method]').forEach(el=>el.onclick=()=>{
    document.querySelectorAll('.pay-option').forEach(x=>x.classList.remove('selected'));
    el.classList.add('selected'); method = el.dataset.method;
  });
  document.getElementById('submitOrder').onclick = async () => {
    const roblox = document.getElementById('robloxUser').value.trim();
    const discord = document.getElementById('discordUser').value.trim();
    if(!roblox){ alert('Roblox username required'); return; }
    if(!method){ alert('Select a payment method'); return; }
    const items = cart.map(c=>({id:c.id,qty:c.qty}));
    const res = await fetch(API+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roblox_username:roblox,discord_username:discord,items,payment_method:method})});
    const data = await res.json();
    if(!res.ok){ alert(data.error||'Order failed'); return; }
    if(method==='card'){
      const r2 = await fetch(API+'/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_number:data.order_number})});
      const d2 = await r2.json();
      if(d2.url){ window.location.href = d2.url; }
      else { alert(d2.error||'Square not configured'); }
    } else {
      cart = []; saveCart();
      closeModal('checkoutModal');
      alert(`Order placed! Order #${data.order_number}\n\nTo complete payment, meet the seller inside Lumber Tycoon 2 and pay LT2$${data.total.toLocaleString()} in-game.\n\nStatus: Awaiting In-Game Payment.\n\nYou can track your order at order-status.html`);
    }
  };
}

// search listener
const searchInput = document.getElementById('search');
if(searchInput) searchInput.addEventListener('input', e=>renderGrid(currentCat, e.target.value));

// cart button
const cartBtn = document.querySelector('.cart-btn');
if(cartBtn) cartBtn.onclick = openCart;
const backdrop = document.getElementById('backdrop');
if(backdrop) backdrop.onclick = closeCart;

loadProducts().then(()=>updateCart());