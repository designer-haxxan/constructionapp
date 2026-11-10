// Settings: business details, next bill number, backup and restore, and resetting to the workbook's starting data.
import * as store from '../store.js';
import * as auth from '../auth.js';
import { esc, toast, toastError, confirmBox, downloadFile, icon } from '../ui.js';
import { setNextInvoiceNo, invoiceLabel } from '../domain.js';

export default {
  async render(root, ctx) {
    const s = store.get();
    const nextNo = s.invoice.next;
    const counts = `${s.customers.length} customers · ${s.dealers.length} dealers · ${s.items.length} price rates · ${s.purchases.length} purchases · ${s.invoices.length} bills · ${s.payments.length} payments`;
    root.innerHTML = `
      <div class="settings-grid">
        <section class="card reveal">
          <div class="card-head"><h3>${icon('building')} Business</h3></div>
          <form class="form" id="biz-form">
            <label class="field"><span>Business name</span><input name="name" required value="${esc(s.business.name)}"></label>
            <label class="field"><span>Tagline (shown on the dashboard and bills)</span><input name="tagline" value="${esc(s.business.tagline || '')}"></label>
            <label class="field"><span>Address</span><input name="address" value="${esc(s.business.address)}"></label>
            <label class="field"><span>City / postal / province</span><input name="city" value="${esc(s.business.city)}"></label>
            <label class="field"><span>Phone</span><input name="phone" inputmode="tel" value="${esc(s.business.phone)}"></label>
            <div class="form-actions"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i> Save business details</button></div>
          </form>
        </section>

        <section class="card reveal">
          <div class="card-head"><h3>${icon('hash')} Bill numbering</h3></div>
          <form class="form" id="num-form">
            <p class="hint">The next bill will be <strong>${esc(invoiceLabel(s, nextNo))}</strong>. The Bill sheet's last number was 4738.</p>
            <label class="field"><span>Next bill number</span><input name="n" type="number" min="1" step="1" required value="${nextNo}"></label>
            <div class="form-actions"><button class="btn btn-ghost" type="submit">Set number</button></div>
          </form>
        </section>

        <section class="card reveal">
          <div class="card-head"><h3>${icon('cloud-arrow-down')} Backup</h3></div>
          <p class="hint">Everything is kept on this device. Download a backup regularly, and keep a copy somewhere safe.</p>
          <p class="muted small">${esc(counts)}</p>
          <div class="form-actions">
            <button class="btn btn-primary" id="bk-export" type="button"><i class="bi bi-download"></i> Download backup</button>
          </div>
          <div class="divider"></div>
          <label class="file-drop" id="bk-drop">
            <input type="file" accept="application/json,.json" id="bk-file" hidden>
            <span>${icon('upload')} Restore from a backup file</span>
            <small>This replaces everything on this device.</small>
          </label>
        </section>

        <section class="card reveal">
          <div class="card-head"><h3>${icon('shield-lock')} Account</h3></div>
          <p class="hint">Signed in as <strong>${esc(auth.currentSession()?.username || '')}</strong>. Your ledger works offline once you are signed in.</p>
          <div class="form-actions"><button class="btn btn-ghost" id="ac-out" type="button"><i class="bi bi-box-arrow-right"></i> Sign out</button></div>
          <div class="divider"></div>
          <h4 class="danger-title">Reset to the workbook's starting data</h4>
          <p class="hint">Removes all bills, purchases, payments and stock adjustments on this device, and restores the price index, customers and dealers from the Excel file.</p>
          <div class="form-actions"><button class="btn btn-danger-ghost" id="rs-seed" type="button"><i class="bi bi-arrow-counterclockwise"></i> Reset</button></div>
        </section>
      </div>`;

    root.querySelector('#biz-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      try {
        await store.mutate((d) => { d.business = { ...d.business, ...f }; });
        document.getElementById('brand-name')?.replaceChildren(f.name);
        toast('Business details saved');
      } catch (err) { toastError(err); }
    });

    root.querySelector('#num-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const n = Number(new FormData(e.target).get('n'));
        await store.mutate((d) => setNextInvoiceNo(d, n));
        toast(`Next bill will be ${invoiceLabel(store.get(), n)}`);
        ctx.refresh();
      } catch (err) { toastError(err); }
    });

    root.querySelector('#bk-export').addEventListener('click', () => {
      const payload = JSON.stringify({ format: 'materials-ledger', version: 1, exportedAt: new Date().toISOString(), data: store.get() }, null, 2);
      downloadFile(`materials-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, payload, 'application/json');
      toast('Backup downloaded');
    });

    root.querySelector('#bk-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const data = parsed.format === 'materials-ledger' ? parsed.data : parsed;
        const ok = await confirmBox(`Restore this backup? It contains ${data.invoices?.length || 0} bills, ${data.purchases?.length || 0} purchases and ${data.payments?.length || 0} payments. Everything on this device will be replaced.`, { okLabel: 'Restore', danger: true });
        if (!ok) return;
        await store.replaceAll(data);
        toast('Backup restored');
        ctx.refresh();
      } catch (err) { toastError(err.name === 'SyntaxError' ? new Error('That file is not a valid backup.') : err); }
    });

    root.querySelector('#ac-out').addEventListener('click', () => {
      auth.signOut();
      location.reload();
    });

    root.querySelector('#rs-seed').addEventListener('click', async () => {
      const ok = await confirmBox('Reset everything to the starting data? All bills, purchases and payments on this device will be deleted.', { okLabel: 'Reset everything', danger: true });
      if (!ok) return;
      await store.resetToSeed();
      toast('Reset to the starting data');
      ctx.refresh();
    });
  },
};
