import { Button } from "../../../core/ui/Button";
import { DownloadIcon } from "../../../core/ui/icons";
import { useWrappedPdf } from "../../../core/wrapped/wrappedPdf";

/**
 * Download PDF: the whole Wrapped, a page of the PDF for each screen of the story (core/wrapped/wrappedPdf.ts). In the
 * header and on the Outro, both the same export; while it works, each says how far it has got. Left out of the PDF itself.
 */
export function WrappedPdfButton({ size = "md", variant = "secondary" }: { size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const pdf = useWrappedPdf();
  return (
    <Button data-pdf-skip variant={variant} size={size} onPress={pdf.start} isDisabled={pdf.busy}>
      <DownloadIcon />
      {pdf.label}
    </Button>
  );
}
