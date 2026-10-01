import { useRef, type ChangeEvent, type CSSProperties, type ReactNode, type RefObject } from "react";

/** A file input someone else already owns (the Submit flow's screenshot, which also takes drops and pastes). */
type OwnedInput = {
  ref: RefObject<HTMLInputElement | null>;
  type: "file";
  accept: string;
  onChange(e: ChangeEvent<HTMLInputElement>): void;
};

type Source = { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; input?: never } | { input: OwnedInput; accept?: never; multiple?: never; onFiles?: never };

/**
 * A button that picks a file: a dashed box with a hidden file input behind it. Pass `accept` and `onFiles` (given
 * every picked file, and the input cleared so the same file can be picked again), or an `input` already wired up.
 * `dragOver` lights it up while a file is dragged over whatever handles the drop. `bare` drops the dashed look for a
 * button drawn its own way (a tile's image, the comic theme's panel), keeping the picking.
 */
export function FileDropButton({
  dragOver = false,
  bare = false,
  isDisabled,
  className,
  style,
  "aria-label": ariaLabel,
  children,
  ...source
}: Source & {
  dragOver?: boolean;
  bare?: boolean;
  isDisabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = source.input?.ref ?? ownRef;
  const look = bare
    ? ""
    : `rounded-md border border-dashed text-on-surface-muted transition-colors hover:text-on-surface ${dragOver ? "border-on-surface bg-surface-raised" : "border-outline-strong hover:border-on-surface/60"}`;
  return (
    <>
      <button type="button" aria-label={ariaLabel} disabled={isDisabled} onClick={() => inputRef.current?.click()} className={`${look} ${className ?? ""}`} style={style}>
        {children}
      </button>
      {source.input ? (
        <input {...source.input} className="hidden" />
      ) : (
        <input
          ref={ownRef}
          type="file"
          accept={source.accept}
          multiple={source.multiple}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length > 0) source.onFiles(files);
          }}
        />
      )}
    </>
  );
}
