export function escapeHtml(str?: string) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildFormHtml(products: any[]) {
  if (!products || products.length === 0) {
    return `<div class="p-4 bg-white rounded shadow text-gray-600">No se encontraron productos.</div>`
  }

  return `\n    <form id="productsForm" class="space-y-3">\n      <div class="p-3 bg-white rounded shadow">\n        <h2 class="text-lg font-medium text-gray-800">Productos encontrados</h2>\n        <p class="text-sm text-gray-500">Selecciona los productos que deseas exportar o copiar.</p>\n      </div>\n\n      <div class="space-y-2 max-h-48 overflow-auto">\n        ${products
    .map(
      (p, i) => `\n          <label class="flex items-start gap-3 p-3 bg-white rounded shadow-sm hover:bg-gray-50">\n            <input type="checkbox" name="selected" value="${i}" class="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded" />\n            <div class="flex-1">\n              <div class="font-semibold text-sm text-gray-800">${escapeHtml(p.nombreArticulo) || '—'}</div>\n              <div class="text-xs text-gray-500">${escapeHtml(p.marca) || ''} • ${escapeHtml(p.precioArticulo) || ''}</div>\n              ${p.descuento ? `<div class="text-xs text-green-600 font-medium">${escapeHtml(p.descuento)}</div>` : ''}\n            </div>\n          </label>`
    )
    .join('')}\n      </div>\n\n      <div class="flex gap-2">\n        <button type="button" id="exportBtn" class="flex-1 px-3 py-2 bg-indigo-600 text-white rounded">Exportar CSV</button>\n        <button type="button" id="copyBtn" class="px-3 py-2 bg-gray-100 text-gray-700 rounded">Copiar JSON</button>\n      </div>\n    </form>\n    `
}

export async function showResults(resultEl: HTMLElement | null, products: any[]) {
  
  if (resultEl) resultEl.innerHTML = buildFormHtml(products)

  // Attach action handlers
  const exportBtn = document.getElementById('exportBtn')
  const copyBtn = document.getElementById('copyBtn')

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('input[name=selected]:checked')).map(el => products[Number((el as HTMLInputElement).value)])
      const rows = checked.length ? checked : products
      const csv = rows.map(r => [r.marca, r.nombreArticulo, r.quienComercializa, r.precioArticulo, r.descuento].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n')
      const csvContent = 'Marca,Nombre,Comercializa,Precio,Descuento\n' + csv
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'productos.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const checked = Array.from(document.querySelectorAll('input[name=selected]:checked')).map(el => products[Number((el as HTMLInputElement).value)])
      const toCopy = checked.length ? checked : products
      try {
        await navigator.clipboard.writeText(JSON.stringify(toCopy, null, 2))
        if (copyBtn) copyBtn.textContent = 'Copiado ✓'
        setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copiar JSON' }, 1500)
      } catch (err) {
        console.error('No se pudo copiar', err)
      }
    })
  }
}
export * from "./types";
export * from "./storage";

