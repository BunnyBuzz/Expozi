import { FileDown, FileText, Loader2, X } from "lucide-react";
import AnswerBody from "./AnswerBody";

interface Props {
  title: string;
  subtitle: string;
  markdown: string;
  exportStatus: string | null;
  exporting: "md" | "pdf" | null;
  onExport: (format: "md" | "pdf") => void;
  onClose: () => void;
}

// Right-side report viewer (Elicit-style split view): the generated document
// rendered as a page, with Markdown / PDF export in the header.
export default function ArtifactPanel({ title, subtitle, markdown, exportStatus, exporting, onExport, onClose }: Props) {
  const busy = exporting !== null;
  return (
    <div className="flex w-[46%] min-w-[420px] max-w-[860px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* header */}
      <div className="flex h-[57px] shrink-0 items-center gap-2.5 border-b border-gray-100 px-4">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <FileText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-tight text-gray-900">{title}</p>
          <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <button
          onClick={() => onExport("pdf")}
          disabled={busy}
          title="Download PDF"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          {exporting === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
        </button>
        <button
          onClick={() => onExport("md")}
          disabled={busy}
          title="Download Markdown (.md)"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          {exporting === "md" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        </button>
        <button onClick={onClose} title="Close" className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
          <X size={17} />
        </button>
      </div>

      {/* document page */}
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto bg-gray-50/80 px-8 py-6">
        <div className="mx-auto max-w-[700px] rounded-lg border border-gray-200 bg-white px-10 py-9 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Expozi · Research report</p>
          <AnswerBody text={markdown} streaming={false} />
        </div>
        {exportStatus && (
          <p className="mx-auto mt-3 max-w-[700px] truncate text-[12px] text-gray-500" title={exportStatus}>
            {exportStatus}
          </p>
        )}
      </div>
    </div>
  );
}
