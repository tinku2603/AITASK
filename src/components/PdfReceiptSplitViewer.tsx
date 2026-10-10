"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Download,
  AlertCircle,
} from "lucide-react";

export interface PreviewableDocument {
  name: string;
  type: string;
  base64: string;
}

interface PdfReceiptSplitViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documents: PreviewableDocument[];
  activeIndex?: number;
  onSelectIndex?: (idx: number) => void;
}

export const PdfReceiptSplitViewer: React.FC<PdfReceiptSplitViewerProps> = ({
  isOpen,
  onClose,
  documents,
  activeIndex = 0,
  onSelectIndex,
}) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const currentDoc = documents && documents.length > 0 ? documents[activeIndex] || documents[0] : null;
  const isPdf = Boolean(
    currentDoc && (currentDoc.type.includes("pdf") || currentDoc.name.toLowerCase().endsWith(".pdf"))
  );

  useEffect(() => {
    if (!currentDoc || !currentDoc.base64) {
      setPdfBlobUrl(null);
      return;
    }

    if (isPdf) {
      try {
        setPdfError(null);
        let rawBase64 = currentDoc.base64.trim();
        if (rawBase64.includes(",")) {
          rawBase64 = rawBase64.split(",")[1];
        }
        // Remove newlines and spaces
        rawBase64 = rawBase64.replace(/\s+/g, "");

        const binaryString = window.atob(rawBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);

        return () => {
          URL.revokeObjectURL(objectUrl);
        };
      } catch (err: any) {
        console.error("PDF Base64 decode error:", err);
        setPdfError("Unable to decode PDF stream: " + err.message);
      }
    } else {
      setPdfBlobUrl(null);
    }
  }, [currentDoc, isPdf]);

  if (!isOpen || !currentDoc) return null;

  const imageSrc = !isPdf
    ? currentDoc.base64.startsWith("data:")
      ? currentDoc.base64
      : `data:${currentDoc.type || "image/png"};base64,${currentDoc.base64}`
    : "";

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoomLevel(100);
    setRotation(0);
  };

  return (
    <aside className="w-full lg:w-[480px] xl:w-[560px] border-l border-slate-800 bg-slate-950 flex flex-col h-full shrink-0 shadow-2xl transition-all">
      {/* Header */}
      <div className="h-14 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
        <div className="flex items-center space-x-2 truncate">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
            {isPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate max-w-[200px]">{currentDoc.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              {isPdf ? "Interactive PDF Document" : "Receipt Image"}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1">
          {isPdf && pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Open PDF in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {!isPdf && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-slate-400 font-mono px-1">{zoomLevel}%</span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRotate}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
            title="Close Preview Pane"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Multiple Files Tabs */}
      {documents.length > 1 && (
        <div className="px-3 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
          {documents.map((doc, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (onSelectIndex) onSelectIndex(idx);
                handleReset();
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                idx === activeIndex
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Doc {idx + 1}: {doc.name.slice(0, 16)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Document View Canvas */}
      <div className="flex-1 overflow-auto bg-slate-900/40 p-3 sm:p-4 flex items-center justify-center">
        {isPdf ? (
          pdfError ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pdfError}</span>
            </div>
          ) : pdfBlobUrl ? (
            <object
              data={pdfBlobUrl}
              type="application/pdf"
              className="w-full h-full rounded-xl border border-slate-800 shadow-inner bg-slate-950"
            >
              <iframe
                src={pdfBlobUrl}
                className="w-full h-full rounded-xl border border-slate-800"
                title={currentDoc.name}
              />
              <div className="p-6 text-center text-xs text-slate-400">
                <p>PDF embedded preview not supported by your browser.</p>
                <a
                  href={pdfBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open PDF in New Window
                </a>
              </div>
            </object>
          ) : (
            <div className="text-xs text-slate-500 animate-pulse">Rendering PDF document...</div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center overflow-auto">
            <img
              src={imageSrc}
              alt={currentDoc.name}
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-in-out",
              }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg border border-slate-800"
            />
          </div>
        )}
      </div>
    </aside>
  );
};
