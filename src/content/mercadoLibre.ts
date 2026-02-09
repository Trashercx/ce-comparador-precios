// Content script for MercadoLibre: placeholder scraper and message handler
export {};

console.log('MercadoLibre content script injected')
let cancelled = false;

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("scrape:")) return;

  port.onMessage.addListener((msg) => {
    if (msg?.type === "cancel") {
      cancelled = true;
      port.postMessage({ type: "cancelled" });
      return;
    }

    if (msg?.type === "start") {
      cancelled = false;

      try {
        const nodeList = document.querySelectorAll(".ui-search-result");
        const datos = Array.from(nodeList);

        const productos = datos.map((producto: Element, idx) => {
          const text = (producto as HTMLElement).innerText || "";
          const parts = text.split("\n");
          return { raw: parts, position: idx + 1 };
        });

        port.postMessage({ type: "result", products: productos });
      } catch (err: any) {
        port.postMessage({ type: "error", message: String(err?.message || err) });
      }
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'scrape') {
    try {
      // Placeholder: MercadoLibre layout differs; adapt selectors as needed.
      const nodeList = document.querySelectorAll('.ui-search-result')
      const datos = Array.from(nodeList)
      const productos = datos.map((producto: Element) => {
        const text = (producto as HTMLElement).innerText || ''
        const parts = text.split('\n')
        return { raw: parts }
      })
      sendResponse({ result: productos })
    } catch (err) {
      console.error('MercadoLibre scrape error', err)
      sendResponse({ error: String(err) })
    }
    return true
  }
})
