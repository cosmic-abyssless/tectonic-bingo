import {
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
} from "react-aria-components";
import { IconButton } from "./Button";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons";

export interface ToastData {
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning";
}

/** App-wide queue; call `toast()` from anywhere (events, mutations). */
export const toastQueue = new ToastQueue<ToastData>({ maxVisibleToasts: 3 });

export function toast(data: ToastData, timeout = 6000) {
  toastQueue.add(data, { timeout });
}

const TONE = {
  info: { icon: InfoIcon, cls: "text-info" },
  success: { icon: CheckIcon, cls: "text-ok" },
  warning: { icon: AlertIcon, cls: "text-warn" },
} as const;

export function ToastRegion() {
  return (
    <AriaToastRegion queue={toastQueue} className="fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 outline-none">
      {({ toast: t }) => {
        const tone = TONE[t.content.tone ?? "info"];
        const Icon = tone.icon;
        return (
          <AriaToast toast={t} className="toast-item flex items-start gap-3 rounded-lg border border-line bg-surface-raised p-3 pl-4 shadow-pop outline-none">
            <Icon className={`mt-0.5 shrink-0 ${tone.cls}`} />
            <ToastContent className="min-w-0 flex-1">
              <Text slot="title" className="block text-sm font-medium text-fg">
                {t.content.title}
              </Text>
              {t.content.description && (
                <Text slot="description" className="mt-0.5 block text-sm text-fg-muted">
                  {t.content.description}
                </Text>
              )}
            </ToastContent>
            <IconButton slot="close" label="Dismiss" size="sm">
              <XIcon />
            </IconButton>
          </AriaToast>
        );
      }}
    </AriaToastRegion>
  );
}
