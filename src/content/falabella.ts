// Content script for Falabella: scrape product items and respond to messages from the extension
export {};

console.log('Falabella content script injected')
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
        const nodeList = document.querySelectorAll('[data-testid=ssr-pod]');
        const datos = Array.from(nodeList);

        const productos = datos.map((producto: Element, idx) => {
          const text = (producto as HTMLElement).innerText || "";
          const [marca, nombreArticulo, quienComercializa, precioArticulo, descuento] = text.split("\n");
          return { marca, nombreArticulo, quienComercializa, precioArticulo, descuento, position: idx + 1 };
        });

        // Enviar “result” por el puerto (NO sendResponse)
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
      const nodeList = document.querySelectorAll('[data-testid=ssr-pod]')
      const datos = Array.from(nodeList)
      const productos = datos.map((producto: Element) => {
        const text = (producto as HTMLElement).innerText || ''
        const [marca, nombreArticulo, quienComercializa, precioArticulo, descuento] = text.split('\n')
        return { marca, nombreArticulo, quienComercializa, precioArticulo, descuento }
      })

      // Reply to the popup (synchronous response)
      sendResponse({ result: productos })

      // Also forward the scraped data to the background service worker for forwarding to external API
      try {
        chrome.runtime.sendMessage({ type: 'scrapedData', data: productos }, (resp) => {
          // optional ack handling
          // console.log('Background ack:', resp)
        })
      } catch (err) {
        console.warn('Could not send scraped data to background', err)
      }
    } catch (err) {
      console.error('Falabella scrape error', err)
      sendResponse({ error: String(err) })
    }
    return true
  }
})
