"use client";

interface PdfViewerProps {
  src: string;
  className?: string;
}

export function PdfViewer({ src, className }: PdfViewerProps) {
  return (
    <iframe
      src={src}
      className={className}
      title="Disclaimer document"
      style={{ minHeight: 500 }}
    />
  );
}
