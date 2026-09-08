import { useEffect, useRef, type ReactNode } from "react";

const MAX_WIDTH = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export function Modal({
  onClose,
  children,
  size = "md",
}: {
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof MAX_WIDTH;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // A plain onClick={onClose} on the backdrop closes on mouseUP alone —
  // dragging a text selection that starts inside the modal (e.g. selecting
  // a description) and releases past its edge fires a click whose target
  // resolves to the backdrop (the nearest common ancestor of the mousedown
  // and mouseup targets), bypassing the content div's stopPropagation
  // entirely since the click never touches it. Only close when BOTH the
  // mousedown and the click landed directly on the backdrop itself, not
  // bubbled up from a drag that started inside the content.
  const mouseDownOnBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        className={`bg-slate-800 rounded-xl w-full ${MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, subtitle, onClose, action }: { title: string; subtitle?: string; onClose: () => void; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between p-5 border-b border-slate-700">
      <div>
        <h2 className="text-white font-bold text-lg">{title}</h2>
        {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer">
          ✕
        </button>
      </div>
    </div>
  );
}
