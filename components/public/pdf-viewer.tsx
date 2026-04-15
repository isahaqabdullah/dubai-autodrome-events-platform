"use client";

import { useEffect, useRef, useState } from "react";

interface PdfViewerProps {
  src: string;
  className?: string;
}

export function PdfViewer({ src, className }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const pdf = await pdfjsLib.getDocument(src).promise;

        if (cancelled) return;
        container!.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const containerWidth = container!.clientWidth;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width * 2;
          canvas.height = viewport.height * 2;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          container!.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          ctx.scale(2, 2);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return (
      <div className={className}>
        <p className="p-4 text-sm text-slate">
          Unable to preview the PDF.{" "}
          <a href={src} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2e768b] underline">
            Open it directly
          </a>
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
