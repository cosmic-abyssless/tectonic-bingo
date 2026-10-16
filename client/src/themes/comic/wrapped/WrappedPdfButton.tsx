import { DownloadIcon } from "../../../core/ui/icons";
import { useWrappedPdf } from "../../../core/wrapped/wrappedPdf";
import { ComicButton, type ComicButtonSize } from "../ui/ComicButton";

/**
 * Download PDF: the whole Wrapped, a page of the PDF for each page of the book (core/wrapped/wrappedPdf.ts). In the
 * header and on the Outro, both the same export; while it works, each says how far it has got. Left out of the PDF itself.
 */
export function WrappedPdfButton({ size = "sm", className }: { size?: ComicButtonSize; className?: string }) {
  const pdf = useWrappedPdf();
  return (
    <ComicButton data-pdf-skip variant="secondary" size={size} sfx={false} onPress={pdf.start} isDisabled={pdf.busy} className={className}>
      <DownloadIcon />
      {pdf.label}
    </ComicButton>
  );
}
