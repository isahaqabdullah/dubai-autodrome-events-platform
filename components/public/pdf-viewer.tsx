"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PdfViewerProps {
  src: string;
  className?: string;
}

export function PdfViewer({ src, className }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);

  return (
    <div className={className}>
      <Document
        file={src}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={<p className="p-4 text-sm text-slate">Loading PDF...</p>}
        error={
          <p className="p-4 text-sm text-slate">
            Unable to preview the PDF.{" "}
            <a href={src} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2e768b] underline">
              Open it directly
            </a>
          </p>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page key={i + 1} pageNumber={i + 1} width={600} />
        ))}
      </Document>
    </div>
  );
}
