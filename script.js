
const PRODUCTS_JSON = 'products.json';
const STORAGE_KEY = 'nc_cart';
// Cambia este número por el tuyo (formato internacional sin + ni ceros iniciales, ej. 5491123456789)
const WHATSAPP_NUMBER = '542634655146';

let products = [];
let cart = {}; // { productId: { id, qty } }
let currentProduct = null;
let currentImageIndex = 0;

/* --- Helper: currency formater --- */
function formatMoney(num){
  return '$' + Number(num).toLocaleString('es-AR');
}

/* --- Load products.json and render catalog --- */
async function loadProducts(){
  // Prefer loading from an Excel file (products.xlsx) if available.
  try{
    const xlsxRes = await fetch(`products.xlsx?_=${Date.now()}`, { cache: 'no-store' });
    if(xlsxRes && xlsxRes.ok){
      const ab = await xlsxRes.arrayBuffer();
      // SheetJS (XLSX) must be available on the page (added via CDN in index.html)
      if(typeof XLSX === 'undefined'){
        console.warn('SheetJS (XLSX) no está disponible. Asegúrate de incluir la librería en index.html. Se intentará products.json como fallback.');
      } else {
        const data = new Uint8Array(ab);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Map rows to product objects expected by the app
        products = rows.map(r => {
          const imagesField = (r.images || r.Images || r.imagenes || r.Imagenes || '').toString();
          const images = imagesField ? imagesField.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : ['images/placeholder.jpg'];
          const priceVal = r.price || r.Price || r.precio || r.Precio || 0;
          const stockVal = r.stock !== undefined && r.stock !== '' ? (r.stock || r.Stock) : undefined;
          return {
            id: (r.id || r.ID || r.sku || r.SKU || (r.title || r.Title) + '').toString(),
            title: r.title || r.Title || r.nombre || r.Nombre || '',
            price: Number(priceVal) || 0,
            images: images,
            short_description: r.short_description || r.short || r.descripcion_corta || r.descripcion || r.Descripcion || '',
            long_description: r.long_description || r.long || r.long_desc || r.descripcion_larga || r.DescripcionLarga || '',
            sku: r.sku || r.SKU || '',
            stock: stockVal !== undefined ? Number(stockVal) : undefined,
            category: r.category || r.Category || '',
            subcategory: r.subcategory || r.Subcategory || ''
          };
        });

        renderCatalog();
        checkHashOnLoad();
        return;
      }
    }
  }catch(err){
    console.warn('No se pudo cargar products.xlsx:', err);
  }

  // Fallback: intentar cargar products.json
  try{
    const res = await fetch(`${PRODUCTS_JSON}?_=${Date.now()}`, { cache: 'no-store' });
    products = await res.json();
    renderCatalog();
    checkHashOnLoad();
  }catch(err){
    console.error('Error loading products.json', err);
    document.getElementById('catalog').innerHTML = '<p>Error cargando productos.</p>';
  }
}

/* --- Catalog rendering --- */
function renderCatalog(list){
  const container = document.getElementById('catalog');
  container.innerHTML = '';
  const items = Array.isArray(list) ? list : products;
  items.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb">
        <img src="${p.images[0]}" alt="${escapeHtml(p.title)} thumbnail">
      </div>
      <h3>${escapeHtml(p.title)}</h3>
      <p class="short">${escapeHtml(p.short_description)}</p>
      <div class="meta"><span class="price">${formatMoney(p.price)}</span></div>
      <div class="card-actions">
        <button class="btn ghost view-product" data-id="${p.id}">Ver producto</button>
        <button class="btn primary add-to-cart" data-id="${p.id}">Agregar al carrito</button>
      </div>
    `;
    container.appendChild(card);
  });

  // attach listeners
  document.querySelectorAll('.view-product').forEach(btn => btn.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id;
    openProductModal(id);
  }));
  document.querySelectorAll('.add-to-cart').forEach(btn => btn.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id;
    addToCart(id,1,true);
  }));
}

/* --- Simple HTML-escape to avoid injection from product data --- */
function escapeHtml(str){
  return (str+'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}

/* --- Cart persistence --- */
function loadCart(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    cart = raw ? JSON.parse(raw) : {};
  }catch(e){
    cart = {};
  }
  updateCartCount();
}
function saveCart(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

/* --- Add to cart (validates stock). fromButton indicates whether show feedback. --- */
function addToCart(productId, qty=1, fromButton=false){
  const p = products.find(x=>x.id===productId);
  if(!p) return alert('Producto no encontrado.');
  const curQty = cart[productId] ? cart[productId].qty : 0;
  const newQty = curQty + Number(qty);
  if(p.stock !== undefined && newQty > p.stock){
    return alert(`No hay suficiente stock. Disponible: ${p.stock}`);
  }
  cart[productId] = { id: productId, qty: newQty };
  saveCart();
  updateCartCount();
  if(fromButton){
    // feedback breve
    const original = document.querySelector(`.add-to-cart[data-id="${productId}"]`);
    if(original){
      original.textContent = 'Agregado ✓';
      setTimeout(()=> original.textContent = 'Agregar al carrito',1200);
    }
  }
  renderCartItems();
}

/* --- Remove product from cart --- */
function removeFromCart(productId){
  delete cart[productId];
  saveCart();
  updateCartCount();
  renderCartItems();
}

/* --- Change quantity for product in cart (validate stock) --- */
function setCartQty(productId, qty){
  const p = products.find(x=>x.id===productId);
  qty = Number(qty);
  if(qty <= 0){
    removeFromCart(productId);
    return;
  }
  if(p.stock !== undefined && qty > p.stock){
    alert(`No hay suficiente stock. Disponible: ${p.stock}`);
    return;
  }
  cart[productId].qty = qty;
  saveCart();
  renderCartItems();
  updateCartCount();
}

/* --- Empty cart --- */
function clearCart(){
  if(!confirm('¿Vaciar el carrito?')) return;
  cart = {};
  saveCart();
  renderCartItems();
  updateCartCount();
}

/* --- UI: cart count --- */
function updateCartCount(){
  const count = Object.values(cart).reduce((s,i)=>s+i.qty,0);
  document.getElementById('cart-count').textContent = count;
}

/* --- Render cart panel items --- */
function renderCartItems(){
  const el = document.getElementById('cart-items');
  el.innerHTML = '';
  let subtotal = 0;
  if(Object.keys(cart).length === 0){
    el.innerHTML = '<p>Tu carrito está vacío.</p>';
  } else {
    for(const key of Object.keys(cart)){
      const item = cart[key];
      const p = products.find(x=>x.id===item.id);
      if(!p) continue;
      const itemRow = document.createElement('div');
      itemRow.className = 'cart-item';
      const itemHtml = `
        <div class="mini"><img src="${p.images[0]}" alt="${escapeHtml(p.title)}" style="max-width:100%;height:100%;object-fit:cover"></div>
        <div class="meta">
          <h4>${escapeHtml(p.title)}</h4>
          <small>${formatMoney(p.price)} x ${item.qty} = <strong>${formatMoney(p.price * item.qty)}</strong></small>
        </div>
        <div class="controls">
          <input class="qty-input" type="number" min="1" value="${item.qty}" data-id="${p.id}">
          <button class="btn ghost remove-item" data-id="${p.id}" title="Eliminar">Eliminar</button>
        </div>
      `;
      itemRow.innerHTML = itemHtml;
      el.appendChild(itemRow);
      subtotal += p.price * item.qty;
    }
  }

  document.getElementById('subtotal').textContent = formatMoney(subtotal);
  // Taxes sample: 0 for now (user can modify)
  const taxes = 0;
  document.getElementById('taxes').textContent = formatMoney(taxes);
  document.getElementById('cart-total').textContent = formatMoney(subtotal + taxes);

  // attach listeners for qty changes and removes
  el.querySelectorAll('.qty-input').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const id = e.target.dataset.id;
      setCartQty(id, Number(e.target.value));
    });
  });
  el.querySelectorAll('.remove-item').forEach(btn=>btn.addEventListener('click', e=>{
    removeFromCart(e.currentTarget.dataset.id);
  }));
}

/* --- Product modal: open/close & content --- */
function openProductModal(productId){
  const p = products.find(x=>x.id===productId);
  if(!p) return;
  currentProduct = p;
  currentImageIndex = 0;
  document.getElementById('product-title').textContent = p.title;
  document.getElementById('product-price').textContent = formatMoney(p.price);
  document.getElementById('product-short').textContent = p.short_description;
  document.getElementById('product-long').textContent = p.long_description;
  // specs list
  const specs = document.getElementById('product-specs');
  specs.innerHTML = '';
  if(p.sku) specs.innerHTML += `<div><strong>SKU:</strong> ${escapeHtml(p.sku)}</div>`;
  if(p.stock !== undefined) specs.innerHTML += `<div><strong>Stock:</strong> ${p.stock}</div>`;

  // images
  renderProductImage();

  // qty (start 1, but if already in cart set that)
  const qtyInput = document.getElementById('product-qty');
  qtyInput.value = cart[p.id] ? cart[p.id].qty : 1;
  qtyInput.min = 1;
  if(p.stock !== undefined) qtyInput.max = p.stock;

  // show modal
  const modal = document.getElementById('product-modal');
  modal.setAttribute('aria-hidden','false');
  modal.style.display = 'flex';
  document.getElementById('product-close-btn').focus();
  // update hash for shareable URL
  history.pushState(null, '', `#product-${p.id}`);
}

/* render big image */
function renderProductImage(){
  if(!currentProduct) return;
  const container = document.getElementById('img-viewer');
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = currentProduct.images[currentImageIndex] || currentProduct.images[0];
  img.alt = currentProduct.title + ' imagen';
  container.appendChild(img);
}

/* close product modal */
function closeProductModal(updateHash=true){
  const modal = document.getElementById('product-modal');
  modal.setAttribute('aria-hidden','true');
  modal.style.display = 'none';
  currentProduct = null;
  if(updateHash){
    // remove product hash
    history.pushState(null, '', location.pathname + location.search);
  }
}

/* --- Event wiring for product modal images and buttons --- */
function initProductModalControls(){
  document.getElementById('img-prev').addEventListener('click', ()=>{
    if(!currentProduct) return;
    currentImageIndex = (currentImageIndex - 1 + currentProduct.images.length) % currentProduct.images.length;
    renderProductImage();
  });
  document.getElementById('img-next').addEventListener('click', ()=>{
    if(!currentProduct) return;
    currentImageIndex = (currentImageIndex + 1) % currentProduct.images.length;
    renderProductImage();
  });

  // add from detail view
  document.getElementById('detail-add-btn').addEventListener('click', ()=>{
    const qty = Number(document.getElementById('product-qty').value) || 1;
    addToCart(currentProduct.id, qty, true);
    // keep modal open for adjustments
    renderCartItems();
  });

  // close buttons
  document.getElementById('product-close-btn').addEventListener('click', ()=> closeProductModal());
  document.getElementById('detail-close-btn').addEventListener('click', ()=> closeProductModal());

  // allow clicking backdrop to close
  document.querySelectorAll('#product-modal .modal-backdrop').forEach(b=>b.addEventListener('click', ()=> closeProductModal()));

  // keyboard ESC to close
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){
      // close any open modals
      if(document.getElementById('product-modal').getAttribute('aria-hidden') === 'false') closeProductModal();
      if(document.getElementById('cart-modal').getAttribute('aria-hidden') === 'false') closeCartModal();
    }
  });
}

/* --- Cart modal controls --- */
function openCartModal(){
  const modal = document.getElementById('cart-modal');
  modal.setAttribute('aria-hidden','false');
  modal.style.display = 'flex';
  document.getElementById('cart-close-btn').focus();
  renderCartItems();
}
function closeCartModal(){
  const modal = document.getElementById('cart-modal');
  modal.setAttribute('aria-hidden','true');
  modal.style.display = 'none';
}

function initCartControls(){
  document.getElementById('open-cart-btn').addEventListener('click', openCartModal);
  document.getElementById('cart-close-btn').addEventListener('click', closeCartModal);
  document.querySelectorAll('#cart-modal .modal-backdrop').forEach(b=>b.addEventListener('click', ()=> closeCartModal()));
  document.getElementById('clear-cart-btn').addEventListener('click', clearCart);

  // send whatsapp
  document.getElementById('send-whatsapp-btn').addEventListener('click', sendOrderByWhatsapp);
}

/* --- Build whatsapp message and open link --- */
function sendOrderByWhatsapp(){
  if(Object.keys(cart).length === 0){
    alert('El carrito está vacío.');
    return;
  }
  const noteEl = document.getElementById('order-note');
  const note = noteEl ? (noteEl.value || '') : '';
  let subtotal = 0;
  let lines = [];
  for(const key of Object.keys(cart)){
    const item = cart[key];
    const p = products.find(x=>x.id===item.id);
    if(!p) continue;
    const line = `${item.qty} x ${p.title} — ${formatMoney(p.price)} c/u — ${formatMoney(p.price * item.qty)}`;
    lines.push(line);
    subtotal += p.price * item.qty;
  }
  lines.push(`\nSubtotal: ${formatMoney(subtotal)}`);
  const taxes = 0;
  lines.push(`Impuestos: ${formatMoney(taxes)}`);
  lines.push(`Total: ${formatMoney(subtotal + taxes)}`);
  if(note) lines.push(`\nNota: ${note}`);
  const message = encodeURIComponent(lines.join('\n'));

  // validate WHATSAPP_NUMBER
  const rawPhone = (WHATSAPP_NUMBER || '').toString();
  const digits = rawPhone.replace(/\D/g,'');
  if(digits.length < 6 || digits.indexOf('0000') === 0){
    alert('Por favor, configura `WHATSAPP_NUMBER` en script.js con tu número (ej: 5491123456789).');
    return;
  }

  // prefer wa.me on mobile, use web.whatsapp.com on desktop for reliable redirect and message prefill
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const url = isMobile
    ? `https://wa.me/${digits}?text=${message}`
    : `https://web.whatsapp.com/send?phone=${digits}&text=${message}`;

  // Try opening in new tab, fallback to copying link or navigating if popup blocked
  // DEBUG: log the generated URL so we can inspect it in Brave's console
  console.log('WhatsApp URL:', url);
  try{
    const opened = window.open(url, '_blank');
    if(!opened){
      // popup blocked — try copy to clipboard then navigate as fallback
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(()=>{
          alert('No se pudo abrir WhatsApp automáticamente. Enlace copiado al portapapeles. Pégalo en el navegador para continuar.');
        }).catch(()=>{
          // as last resort, navigate
          window.location.href = url;
        });
      } else {
        window.location.href = url;
      }
    }
  }catch(e){
    // unexpected error — navigate as last resort
    window.location.href = url;
  }
}

/* --- Hash navigation: open product modal when hash like #product-<id> --- */
function checkHashOnLoad(){
  if(location.hash && location.hash.startsWith('#product-')){
    const id = location.hash.replace('#product-','');
    // find product id
    const p = products.find(x=>x.id===id);
    if(p){
      openProductModal(p.id);
    }
  }
}
window.addEventListener('hashchange', ()=>{
  if(location.hash && location.hash.startsWith('#product-')){
    const id = location.hash.replace('#product-','');
    const p = products.find(x=>x.id===id);
    if(p) openProductModal(p.id);
  } else {
    // close product modal when hash removed
    if(document.getElementById('product-modal').getAttribute('aria-hidden') === 'false') closeProductModal(false);
  }
});

/* --- Utilities & init --- */
function init(){
  // Clear cart on every page load so the cart starts empty each session
  try{
    localStorage.removeItem(STORAGE_KEY);
  }catch(e){
    // ignore
  }
  loadCart();
  loadProducts();
  initProductModalControls();
  initCartControls();

  // render cart items on load
  renderCartItems();
}
init();

/* --- small helper to escape HTML in innerHTML contexts (used above) --- */
function safeText(node, text){
  node.textContent = text;
}

// Manejar clic en las categorías iniciales (esperar a DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.category;
      loadCategory(cat);
    });
  });
  // back to categories button
  const backBtn = document.getElementById('back-to-categories-btn');
  if(backBtn){
    backBtn.addEventListener('click', ()=>{
      const catScreen = document.getElementById('category-screen');
      if(catScreen) catScreen.style.display = '';
      const subcatScreen = document.getElementById('subcategory-screen');
      if(subcatScreen) subcatScreen.style.display = 'none';
      const catalogEl = document.getElementById('catalog');
      if(catalogEl) catalogEl.style.display = 'none';
      backBtn.style.display = 'none';
      // scroll to top of categories
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  // Search UI: debounce helper and listeners
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  function debounce(fn, wait){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=> fn.apply(this,args), wait);
    };
  }

  function performSearch(query){
    query = (query || '').trim().toLowerCase();
    if(!query){
      // if empty, hide catalog and show categories
      const catalogEl = document.getElementById('catalog');
      if(catalogEl) catalogEl.style.display = 'none';
      const subcatScreen = document.getElementById('subcategory-screen');
      if(subcatScreen) subcatScreen.style.display = 'none';
      const catScreen = document.getElementById('category-screen');
      if(catScreen) catScreen.style.display = '';
      const backBtn = document.getElementById('back-to-categories-btn');
      if(backBtn) backBtn.style.display = 'none';
      return;
    }

    // filter products globally by title, short_description or sku
    const filtered = products.filter(p => {
      const hay = [p.title, p.short_description, p.long_description, p.sku, p.category, p.subcategory]
        .filter(Boolean)
        .join(' ').toLowerCase();
      return hay.indexOf(query) !== -1;
    });

    // show catalog with results
    const catalogEl = document.getElementById('catalog');
    if(catalogEl) catalogEl.style.display = 'grid';
    const catScreen = document.getElementById('category-screen');
    if(catScreen) catScreen.style.display = 'none';
    const subcatScreen = document.getElementById('subcategory-screen');
    if(subcatScreen) subcatScreen.style.display = 'none';
    const backBtn = document.getElementById('back-to-categories-btn');
    if(backBtn) backBtn.style.display = 'inline-block';

    renderCatalog(filtered);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const debouncedSearch = debounce((e) => performSearch(e.target.value), 220);
  if(searchInput){
    searchInput.addEventListener('input', debouncedSearch);
    searchInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter') performSearch(searchInput.value);
    });
  }
  if(searchBtn){
    searchBtn.addEventListener('click', ()=>{
      const q = searchInput ? searchInput.value : '';
      performSearch(q);
    });
  }
});

// Función que cambia de categorías → subcategorías o catálogo filtrado
function loadCategory(categoryName) {
  // Ocultar pantalla de categorías
  const catScreen = document.getElementById("category-screen");
  if(catScreen) catScreen.style.display = "none";

  // Mostrar botón volver
  const backBtn = document.getElementById('back-to-categories-btn');
  if(backBtn) backBtn.style.display = 'inline-block';

  // Obtener productos de esta categoría
  const categoryProducts = products.filter(p => p.category === categoryName);
  
  // Detectar si hay subcategorías en esta categoría
  const subcats = [...new Set(categoryProducts.filter(p => p.subcategory).map(p => p.subcategory))];
  
  if(subcats.length > 0){
    // Si hay subcategorías, mostrarlas
    renderSubcategories(categoryName, subcats);
    return;
  }

  // Si no hay subcategorías, mostrar productos directamente
  const catalogEl = document.getElementById("catalog");
  if(catalogEl) catalogEl.style.display = "grid";
  const subcatScreen = document.getElementById('subcategory-screen');
  if(subcatScreen) subcatScreen.style.display = 'none';

  // Renderizar catálogo
  renderCatalog(categoryProducts);

  // Subir al inicio
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Renderizar subcategorías
function renderSubcategories(parentCategory, subcats){
  const container = document.getElementById('subcategory-screen');
  if(!container) return;
  
  container.innerHTML = '';
  
  subcats.forEach(subcat => {
    const card = document.createElement('article');
    card.className = 'category-card subcategory-card';
    
    // Obtener un producto de esta subcategoría para la imagen
    const sample = products.find(p => p.category === parentCategory && p.subcategory === subcat);
    const img = sample && sample.images && sample.images[0] ? sample.images[0] : 'images/placeholder.jpg';
    const displayName = subcat.charAt(0).toUpperCase() + subcat.slice(1);
    
    card.innerHTML = `
      <div class="cat-image">
        <img src="${img}" alt="${displayName}">
      </div>
      <h2>${displayName}</h2>
      <button class="btn primary subcategory-btn" data-parent-category="${parentCategory}" data-subcategory="${subcat}">Ver productos</button>
    `;
    container.appendChild(card);
  });
  
  container.style.display = 'grid';
  
  // Attach listeners
  document.querySelectorAll('.subcategory-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const parentCat = e.currentTarget.dataset.parentCategory;
      const subcat = e.currentTarget.dataset.subcategory;
      loadSubcategory(parentCat, subcat);
    });
  });
  
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Cargar productos de una subcategoría
function loadSubcategory(categoryName, subcategoryName){
  // Ocultar pantalla de subcategorías
  const subcatScreen = document.getElementById('subcategory-screen');
  if(subcatScreen) subcatScreen.style.display = 'none';
  
  // Mostrar catálogo
  const catalogEl = document.getElementById("catalog");
  if(catalogEl) catalogEl.style.display = "grid";

  // Filtrar productos por categoría y subcategoría
  const filtered = products.filter(p => p.category === categoryName && p.subcategory === subcategoryName);

  // Renderizar catálogo
  renderCatalog(filtered);

  // Subir al inicio
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* EOF */
