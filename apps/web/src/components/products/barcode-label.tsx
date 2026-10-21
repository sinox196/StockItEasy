'use client';

import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';

/** Renders a scannable barcode (EAN-13 when valid, CODE128 otherwise) for label printing. */
export function BarcodeSvg({ code, height = 50 }: { code: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const format = /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128';
    try {
      JsBarcode(ref.current, code, { format, height, displayValue: true, fontSize: 14, margin: 4, background: '#ffffff' });
    } catch {
      JsBarcode(ref.current, code, { format: 'CODE128', height, displayValue: true, fontSize: 14, margin: 4 });
    }
  }, [code, height]);
  return <svg ref={ref} role="img" aria-label={code} />;
}

export function printLabel(name: string, price: string, svgHtml: string) {
  const w = window.open('', '_blank', 'width=420,height=320');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${name.replace(/</g, '')}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:12px;text-align:center}h1{font-size:14px;margin:0 0 4px}p{font-size:18px;font-weight:700;margin:4px 0}@page{size:60mm 40mm;margin:2mm}</style></head>
<body><h1></h1>${svgHtml}<p></p><script>document.querySelector('h1').textContent=${JSON.stringify(name)};document.querySelector('p').textContent=${JSON.stringify(price)};window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}
