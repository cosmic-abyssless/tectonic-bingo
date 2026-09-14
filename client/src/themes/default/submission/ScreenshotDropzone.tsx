import { MAX_UPLOAD_MB } from "@bingo/shared";
import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { ImageIcon } from "../../../core/ui/icons";

export function ScreenshotDropzone({ screenshot }: { screenshot: SubmissionFlowModel["screenshot"] }) {
  return (
    <Field label="Screenshot" as="div">
      <button
        type="button"
        onClick={screenshot.openFilePicker}
        className={`relative block w-full rounded-md border border-dashed transition-colors ${
          screenshot.dragOver ? "border-fg bg-surface-raised" : "border-line-strong hover:border-fg/60"
        } ${screenshot.previewUrl ? "h-52" : "h-40"}`}
      >
        {screenshot.previewUrl ? (
          <img src={screenshot.previewUrl} alt="Preview" className="absolute inset-0 h-full w-full rounded-md object-contain p-2" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-subtle">
            <ImageIcon size={28} />
            <span className="text-sm text-fg-muted">Drag & drop or click to upload</span>
            <span className="text-xs">PNG, JPG, WebP — max {MAX_UPLOAD_MB} MB</span>
          </span>
        )}
      </button>
      <input {...screenshot.inputProps} className="hidden" />
    </Field>
  );
}
