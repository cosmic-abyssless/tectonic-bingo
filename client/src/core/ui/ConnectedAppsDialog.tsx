import { McpConnectionsList } from "../admin/McpConnectionsList";
import { useDialogParts } from "./useDialogParts";

/** An Admin's own Claude connections to the admin MCP server, from the account menu (#293). */
export function ConnectedAppsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader title="Connected apps" onClose={onClose} />
      {/* Mounted only while open, so the list is fetched fresh each time. */}
      {isOpen && (
        <div className="space-y-3 p-5">
          <p className="text-sm text-on-surface-muted">Claude apps you've let read Tectonic Bingo's stats. Revoke one to cut it off straight away.</p>
          <McpConnectionsList scope="mine" />
        </div>
      )}
    </Dialog>
  );
}
