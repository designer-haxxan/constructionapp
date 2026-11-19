// Price index (the Price Index sheet): the rate for each brand and quality. Used to fill bills and purchases and to value stock.
import * as store from '../store.js';
import { esc, money, icon, formModal, toast, toastError, productLook } from '../ui.js';
import { setPrices, addItem, addProduct, updateProduct, updateItem, itemName } from '../domain.js';

export default {
  async render(root, ctx) {
    const s = store.get();
    const changes = new Map();
    root.innerHTML = `
      <div class="page-head">
        <div><p class="muted">These rates pre-fill bills and purchases and value the stock. Changing a rate does not change saved bills or entries.</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-add-product type="button"><i class="bi bi-plus-square"></i> New product</button>
          <button class="btn btn-ghost" data-add-item type="button"><i class="bi bi-plus-lg"></i> New brand / quality</button>
        </div>
      </div>
      <div data-groups></div>
      <div class="savebar" data-savebar hidden>
        <span><strong data-count>0</strong> rate(s) changed</span>
        <div class="page-actions"><button class="btn btn-ghost" data-discard type="button">Discard</button><button class="btn btn-accent" data-save type="button"><i class="bi bi-check2"></i> Save rates</button></div>
      </div>`;

    const groups = root.querySelector('[data-groups]');
    const bar = root.querySelector('[data-savebar]');
    const draw = () => {
      const cur = store.get();
      groups.innerHTML = cur.products.map((p) => {
        const rows = cur.items.filter((i) => i.product === p.name);
        const look = productLook(p.name);
        return `<section class="card price-group reveal" style="--hue:${look.hue}">
          <header class="group-head"><span class="group-icon">${icon(look.icon)}</span><div><h3>${esc(p.name)}</h3><div class="muted small">rate per ${esc(p.unit)}</div></div>
            <span class="muted small">${rows.length} rate${rows.length === 1 ? '' : 's'}</span>
            <button class="icon-btn" data-edit-product="${esc(p.name)}" aria-label="Edit product ${esc(p.name)}" title="Edit product name and unit" type="button">${icon('pencil')}</button></header>
          ${rows.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Brand</th><th>Quality / size</th><th class="num">Rate (Rs)</th><th></th></tr></thead>
            <tbody>${rows.map((i) => {
              const v = changes.has(i.id) ? changes.get(i.id) : (i.price ?? '');
              return `<tr class="${changes.has(i.id) ? 'changed' : ''}"><td class="strong">${esc(i.brand || '—')}</td><td>${esc(i.quality || '—')}</td>
                <td class="num rate-cell"><input type="number" min="0" step="any" inputmode="decimal" data-rate="${esc(i.id)}" data-orig="${i.price ?? ''}" value="${v}" aria-label="Rate for ${esc(itemName(i))}"></td>
                <td class="actions"><button class="icon-btn" data-edit-item="${esc(i.id)}" aria-label="Edit ${esc(itemName(i))}" title="Edit brand or quality" type="button">${icon('pencil')}</button></td></tr>`;
            }).join('')}</tbody></table></div>` : `<div class="empty-mini">No brands or sizes yet.</div>`}
        </section>`;
      }).join('') || `<div class="empty"><p>No products yet.</p></div>`;
      bar.hidden = changes.size === 0;
      root.querySelector('[data-count]').textContent = changes.size;
    };
    draw();

    groups.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-rate]');
      if (!inp) return;
      const orig = inp.dataset.orig;
      const val = inp.value.trim();
      if (val === orig || (val === '' && orig === '')) changes.delete(inp.dataset.rate);
      else changes.set(inp.dataset.rate, val === '' ? null : Number(val));
      inp.closest('tr').classList.toggle('changed', changes.has(inp.dataset.rate));
      bar.hidden = changes.size === 0;
      root.querySelector('[data-count]').textContent = changes.size;
    });

    root.querySelector('[data-discard]').addEventListener('click', () => { changes.clear(); draw(); });

    // Renaming keeps the bills, purchases, stock and dealer lists in step (see updateProduct / updateItem).
    groups.addEventListener('click', (e) => {
      const pb = e.target.closest('[data-edit-product]');
      const ib = e.target.closest('[data-edit-item]');
      if (pb) {
        const p = store.get().products.find((x) => x.name === pb.dataset.editProduct);
        formModal({
          title: 'Edit product',
          submitLabel: 'Save product',
          body: `<div class="grid-form">
            <label class="field"><span>Product name</span><input name="name" required value="${esc(p.name)}"></label>
            <label class="field"><span>Unit</span><input name="unit" required value="${esc(p.unit)}"></label></div>
            <p class="hint">Bills, purchases, stock and dealer product lists keep following this product under its new name.</p>`,
          onSubmit: async (v) => {
            await store.mutate((d) => updateProduct(d, p.name, { name: v.name, unit: v.unit }));
            toast(`${v.name} updated`);
            ctx.refresh();
            return true;
          },
        });
      } else if (ib) {
        const it = store.get().items.find((x) => x.id === ib.dataset.editItem);
        formModal({
          title: 'Edit brand or quality',
          submitLabel: 'Save',
          body: `<div class="grid-form">
            <label class="field"><span>Product</span><input value="${esc(it.product)}" disabled></label>
            <label class="field"><span>Brand (optional)</span><input name="brand" value="${esc(it.brand)}"></label>
            <label class="field"><span>Quality / size (optional)</span><input name="quality" value="${esc(it.quality)}"></label></div>
            <p class="hint">The rate stays with this item. Bills and purchases already saved move to the new name.</p>`,
          onSubmit: async (v) => {
            await store.mutate((d) => updateItem(d, it.id, { brand: v.brand, quality: v.quality }));
            toast('Updated');
            ctx.refresh();
            return true;
          },
        });
      }
    });
    root.querySelector('[data-save]').addEventListener('click', async () => {
      try {
        const list = [...changes].map(([id, price]) => ({ id, price }));
        await store.mutate((d) => setPrices(d, list));
        toast(`${list.length} rate${list.length === 1 ? '' : 's'} saved`);
        changes.clear();
        draw();
      } catch (err) { toastError(err); }
    });

    root.querySelector('[data-add-product]').addEventListener('click', () => {
      formModal({
        title: 'New product',
        submitLabel: 'Add product',
        body: `<div class="grid-form">
          <label class="field"><span>Product name</span><input name="name" required placeholder="e.g. Plaster"></label>
          <label class="field"><span>Unit</span><input name="unit" required placeholder="e.g. Bags, Kgs, Feet"></label></div>`,
        onSubmit: async (v) => { await store.mutate((d) => addProduct(d, v)); toast(`${v.name} added`); ctx.refresh(); return true; },
      });
    });

    root.querySelector('[data-add-item]').addEventListener('click', () => {
      formModal({
        title: 'New brand or quality',
        submitLabel: 'Add to price index',
        body: `<div class="grid-form">
          <label class="field"><span>Product</span><select class="select" name="product" required>${s.products.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Brand (optional)</span><input name="brand" placeholder="e.g. Paidar"></label>
          <label class="field"><span>Quality / size (optional)</span><input name="quality" placeholder="e.g. 60 Guage"></label>
          <label class="field"><span>Rate (Rs)</span><input name="price" type="number" step="any" inputmode="decimal" placeholder="0"></label></div>`,
        onSubmit: async (v) => {
          const price = String(v.price ?? '').trim() === '' ? null : Number(v.price);
          await store.mutate((d) => addItem(d, { product: v.product, brand: v.brand, quality: v.quality, price }));
          toast('Added to the price index');
          ctx.refresh();
          return true;
        },
      });
    });
  },
};
