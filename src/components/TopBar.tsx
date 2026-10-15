import { useState } from "react";
import { List, Share2 } from "lucide-react";

interface Props {
  title: string;
  versions: number;
  onShare: () => void;
}

export default function TopBar({ title, versions, onShare }: Props) {
  const [shared, setShared] = useState(false);

  const handleShare = () => {
    onShare();
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6">
      <h1 className="min-w-0 flex-1 truncate text-[19px] font-semibold text-gray-900">{title}</h1>
      <button className="rounded-md px-1.5 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100" title="More options">
        •••
      </button>
      <button
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        title="Versions"
      >
        <List size={17} />
        {versions}
      </button>
      <button
        onClick={handleShare}
        className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
      >
        {shared ? "Copied!" : "Share"}
      </button>
      <Share2 size={0} className="hidden" />
    </header>
  );
}
