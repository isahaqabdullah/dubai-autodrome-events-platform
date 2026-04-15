"use client";

import { useEffect, useRef, useState } from "react";

interface PdfViewerProps {
  src: string;
  className?: string;
}

export function PdfViewer({ src, className }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        // v5 requires setting the worker
        if ("GlobalWorkerOptions" in pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        }

        const loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;

        if (cancelled) return;
        container!.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const containerWidth = container!.clientWidth || 600;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth / unscaledViewport.width) * 2;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          container!.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport } as any).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("PDF render error:", err);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
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

  return (
    <div className={className}>
      {loading && <p className="p-4 text-sm text-slate">Loading PDF...</p>}
      <div ref={containerRef} />
    </div>
  );
}
