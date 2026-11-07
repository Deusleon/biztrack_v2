import JsBarcode from "jsbarcode";

// Render barcode to an SVG and open a print window
export function printBarcode(barcodeValue, title = "") {
  if (!barcodeValue) {
    console.warn("printBarcode: no barcode value provided");
    return;
  }

  // Create SVG element
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");

  try {
    // JsBarcode can render onto SVG element
    JsBarcode(svg, String(barcodeValue), {
      format: "CODE128",
      displayValue: true,
      fontSize: 18,
      height: 60,
      margin: 10,
    });
  } catch (err) {
    console.error("JsBarcode render failed", err);
    // fallback: open simple text print
    const win = window.open("", "_blank");
    win.document.write(`<pre>${title}\n${barcodeValue}</pre>`);
    win.document.close();
    win.print();
    win.close();
    return;
  }

  // Serialize SVG to string
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  const html = `
  <!doctype html>
  <html>
    <head>
      <title>Print Barcode</title>
      <style>
        body { display:flex; align-items:center; justify-content:center; height:100vh; margin:0; font-family:'Heebo', Arial, sans-serif; }
        .container { text-align:center; }
        .title { margin-bottom: 8px; font-weight:600; }
        svg { max-width: 320px; width:100%; height:auto; }
        @media print { body { margin:0 } }
      </style>
    </head>
    <body>
      <div class="container">
        ${title ? `<div class="title">${title}</div>` : ""}
        ${svgString}
      </div>
    </body>
  </html>
  `;

  // Create or reuse hidden iframe
  let iframe = document.getElementById("barcode-print-iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "barcode-print-iframe";
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);
  }

  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Give browser a moment to render, then print
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
}

export default printBarcode;
