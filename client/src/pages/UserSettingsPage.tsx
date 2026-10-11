import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  NOTIFICATION_CATALOGUE,
  NOTIFICATION_GROUP_LABELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LEVEL_LABELS,
  QUEUE_THRESHOLDS,
  isDiscordKindOn,
  isKindOn,
  levelAtLeast,
  type NotificationGroup,
  type NotificationKind,
  type NotificationLevel,
  BOARD_SIZE_DEVICE_LABELS,
  BOARD_SIZE_DEVICES,
  boardSizeSummary,
  type BoardSizeDevice,
} from "@bingo/shared";
import { useDiscordTestDm, useNotificationSettings, useUpdateNotificationSettings } from "../api/notificationsApi";
import { useRefreshPresence } from "../context/WebSocketContext";
import { useSiteCan } from "../headless/permissions";
import { AppHeader } from "../core/ui/AppHeader";
import { Button } from "../core/ui/Button";
import { TextButton } from "../core/ui/TextButton";
import { Card, CardHeader, Notice } from "../core/ui/Card";
import { AlertIcon, InfoIcon, MonitorIcon, MoonIcon, SunIcon } from "../core/ui/icons";
import { useColorSchemePreference } from "../core/ui/colorScheme";
import { useBingos } from "../api/queries";
import { useUserSettings } from "../api/userSettingsApi";
import { BoardSizeControls } from "../core/settings/BoardSizeControls";
import { BOARD_SIZE_PREVIEW_PARAM } from "../core/settings/BoardSizePreviewPanel";
import { useBoardSizeDevice } from "../core/settings/boardSize";
import { SegmentedControl } from "../core/ui/SegmentedControl";
import { Select } from "../core/ui/Select";
import { Switch } from "../core/ui/Switch";
import { toast } from "../core/ui/Toast";

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  return "Notification" in window ? Notification.permission : "unsupported";
}

/** How to allow notifications again after saying no, in the words of the browser it looks like. */
function unblockInstructions(): string {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "Click the icon at the left of the address bar, then remove the block next to “Send notifications”.";
  if (/Edg\//.test(ua)) return "Click the icon at the left of the address bar, choose Permissions for this site, and set Notifications to Allow.";
  if (/Chrome\//.test(ua)) return "Click the icon at the left of the address bar, choose Site settings, and set Notifications to Allow.";
  if (/Safari\//.test(ua)) return "Open Safari › Settings › Websites › Notifications, and set this site to Allow.";
  return "Open your browser's settings for this site and allow notifications.";
}

/** The browser step's permission: asked for only from the Allow button, here. */
function BrowserPermission() {
  const [permission, setPermission] = useState<Permission>(currentPermission);
  const refreshPresence = useRefreshPresence();
  useEffect(() => {
    // Changed in another tab or the browser's own settings.
    const check = () => setPermission(currentPermission());
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  if (permission === "unsupported") {
    return <Notice tone="warn" icon={<AlertIcon size={14} />}>This browser can't show notifications. You'll still get them in the app{" "}—{" "}and on Discord at + Discord.</Notice>;
  }
  if (permission === "granted") return <p className="text-sm text-ok">This browser shows notifications while the site is open in another tab.</p>;
  if (permission === "denied") {
    return (
      <Notice tone="warn" icon={<AlertIcon size={14} />}>
        <span className="block">This browser is blocking notifications from the site. {unblockInstructions()}</span>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onPress={() => {
            const next = currentPermission();
            setPermission(next);
            refreshPresence();
            if (next === "denied") toast({ title: "Still blocked", tone: "warning" });
          }}
        >
          Check again
        </Button>
      </Notice>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="primary"
        size="sm"
        onPress={async () => {
          setPermission(await Notification.requestPermission());
          refreshPresence();
        }}
      >
        Allow on this browser
      </Button>
      <span className="text-sm text-on-surface-muted">Each browser you use asks once.</span>
    </div>
  );
}

function DiscordStatus({ unreachableSince }: { unreachableSince: string | null }) {
  const testDm = useDiscordTestDm();
  // A Site admin can check that DMs go out at all: the message says what Discord answered if they don't.
  const siteAdmin = useSiteCan("administer_site").allowed;
  const sendTest = () => testDm.mutate(undefined, { onSuccess: (r) => toast({ title: r.message, tone: r.ok ? "success" : "warning" }) });
  if (!unreachableSince) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-on-surface-muted">When the site isn't open, the clan's bot DMs you on Discord. Bursts wait a few minutes and arrive as one message.</p>
        {siteAdmin && (
          <Button size="sm" variant="secondary" isDisabled={testDm.isPending} onPress={sendTest}>
            Send a test DM
          </Button>
        )}
      </div>
    );
  }
  return (
    <Notice tone="danger" icon={<AlertIcon size={14} />}>
      <strong className="block">Can't reach you on Discord.</strong>
      <span className="block">
        The bot can't DM you: you've turned off DMs from server members, or left the server. In Discord, open the clan server's Privacy Settings and allow Direct Messages, then try again.
      </span>
      <Button size="sm" variant="secondary" className="mt-2" isDisabled={testDm.isPending} onPress={sendTest}>
        Try again
      </Button>
    </Notice>
  );
}

const GROUP_ORDER: NotificationGroup[] = ["player", "captain", "moderator", "admin", "site"];

const COLOR_SCHEMES = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
  { id: "system", label: "System", icon: MonitorIcon },
] as const;

/** Light, Dark, or the device's own: kept in this browser. */
function AppearanceCard() {
  const [colorScheme, setColorScheme] = useColorSchemePreference();
  return (
    <Card>
      <CardHeader title="Appearance" description="Light or dark, or System to follow your device. Saved in this browser." />
      <div className="p-4">
        <SegmentedControl
          aria-label="Color scheme"
          options={COLOR_SCHEMES.map(({ id, label, icon: Icon }) => ({
            id,
            label: (
              <span className="flex items-center gap-1.5">
                <Icon size={14} /> {label}
              </span>
            ),
          }))}
          value={colorScheme}
          onChange={setColorScheme}
        />
      </div>
    </Card>
  );
}

/**
 * The Board size for each kind of device (shared userSettings.ts). Change on the device you're on opens the Board with
 * the panel over it (BoardSizePreviewPanel), to see each change on the real thing: the Bingo you came here from, else
 * the latest. The other device's is changed here, since this window can't show it; so is this one's with no Bingo to
 * open.
 */
function BoardSizeCard() {
  const { boardSize } = useUserSettings();
  const here = useBoardSizeDevice();
  const navigate = useNavigate();
  const fromSlug = (useLocation().state as { bingoSlug?: string } | null)?.bingoSlug;
  const latestSlug = useBingos().data?.bingos.find((b) => !b.historical)?.slug;
  const previewSlug = fromSlug ?? latestSlug;
  const [editing, setEditing] = useState<BoardSizeDevice | null>(null);
  return (
    <Card>
      <CardHeader title="Board size" description="How big the Board is drawn. Your computer and your phone each have their own." />
      <ul className="divide-y divide-outline">
        {BOARD_SIZE_DEVICES.map((device) => {
          const preview = device === here && previewSlug;
          return (
            <li key={device} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-20 text-sm font-medium text-on-surface">
                  {BOARD_SIZE_DEVICE_LABELS[device]}
                  {device === here && <span className="block text-xs font-normal text-on-surface-subtle">This device</span>}
                </span>
                <span className="text-sm text-on-surface-muted">{boardSizeSummary(boardSize[device])}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  onPress={() => (preview ? navigate(`/b/${previewSlug}?${BOARD_SIZE_PREVIEW_PARAM}=preview`) : setEditing(editing === device ? null : device))}
                >
                  {preview ? "Change" : editing === device ? "Done" : "Change"}
                </Button>
              </div>
              {editing === device && !preview && <BoardSizeControls device={device} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Their Notification settings (CONTEXT.md "Notification", "Catch-up"): the one Level, each kind on or off across every
 * Bingo (only the groups of roles they hold), and Catch-up. No per-Bingo mute, snooze or quiet hours.
 */
function NotificationSettings() {
  const { data } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  if (!data) return null;
  const { settings, groups, discordAvailable, discordUnreachableSince } = data;
  const levels = (Object.keys(NOTIFICATION_LEVEL_LABELS) as NotificationLevel[]).filter((l) => l !== "discord" || discordAvailable);
  const kindsIn = (group: NotificationGroup) => NOTIFICATION_KINDS.filter((k) => NOTIFICATION_CATALOGUE[k].group === group);
  const setKinds = (kinds: NotificationKind[], on: boolean) => update.mutate({ kinds: Object.fromEntries(kinds.map((k) => [k, on])) });
  const off = settings.level === "off";

  return (
    <section aria-labelledby="notifications-heading" className="space-y-4">
      <h2 id="notifications-heading" className="pt-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">
        Notifications
      </h2>
      <Card>
        <CardHeader title="How you hear about things" description="Everything is off until you turn it on. Each step adds to the ones before it." />
        <div className="space-y-3 p-4">
          <SegmentedControl
            aria-label="Notification level"
            options={levels.map((id) => ({ id, label: NOTIFICATION_LEVEL_LABELS[id] }))}
            value={settings.level}
            onChange={(level) => update.mutate({ level })}
          />
          <p className="text-sm text-on-surface-muted">
            {settings.level === "off" && "No Inbox, no toasts, nothing collected for you."}
            {settings.level === "app" && "An Inbox behind the bell, and a toast when you have the site open."}
            {settings.level === "browser" && "Plus a browser notification when the site is open in a tab you're not looking at."}
            {settings.level === "discord" && "Plus a Discord DM from the clan's bot when the site isn't open at all."}
          </p>
          {levelAtLeast(settings.level, "browser") && <BrowserPermission />}
          {settings.level === "discord" && <DiscordStatus unreachableSince={discordUnreachableSince} />}
        </div>
      </Card>

      <Card className={off ? "opacity-60" : undefined}>
        <CardHeader title="What you hear about" description="Each one is on or off for you in every Bingo." />
        <div className="space-y-5 p-4">
          {GROUP_ORDER.filter((g) => groups.includes(g)).map((group) => {
            const kinds = kindsIn(group);
            const allOn = kinds.every((k) => isKindOn(k, settings.kinds));
            return (
              <section key={group} aria-label={NOTIFICATION_GROUP_LABELS[group]}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">{NOTIFICATION_GROUP_LABELS[group]}</h2>
                  <TextButton onPress={() => setKinds(kinds, !allOn)}>{allOn ? "None" : "All"}</TextButton>
                </div>
                <ul className="space-y-2">
                  {kinds.map((kind) => (
                    <li key={kind} className="flex flex-wrap items-center justify-between gap-2">
                      <Switch isSelected={isKindOn(kind, settings.kinds)} onChange={(on) => setKinds([kind], on)}>
                        <span>
                          <span className="block text-on-surface">{NOTIFICATION_CATALOGUE[kind].label}</span>
                          <span className="block text-xs text-on-surface-subtle">{NOTIFICATION_CATALOGUE[kind].description}</span>
                        </span>
                      </Switch>
                      <div className="flex items-center gap-3">
                        {kind === "queue_waiting_long" && (
                          <div className="w-28">
                          <Select
                            size="sm"
                            aria-label="Waiting longer than"
                            value={String(settings.queueThresholdMinutes)}
                            onChange={(v) => update.mutate({ queueThresholdMinutes: Number(v) as (typeof QUEUE_THRESHOLDS)[number] })}
                            options={QUEUE_THRESHOLDS.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h` }))}
                          />
                          </div>
                        )}
                        {/* At + Discord, each kind that's on can be kept off Discord: in the Inbox and on the site only. */}
                        {settings.level === "discord" && isKindOn(kind, settings.kinds) && (
                          <Switch
                            aria-label={`${NOTIFICATION_CATALOGUE[kind].label} on Discord`}
                            isSelected={isDiscordKindOn(kind, settings.discordKinds)}
                            onChange={(on) => update.mutate({ discordKinds: { [kind]: on } })}
                          >
                            Discord
                          </Switch>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Catch-up" description="When you come back to a Bingo, a summary at the top of its page of what happened while you were away." />
        <div className="space-y-2 p-4">
          <Switch isSelected={settings.catchUpEnabled} onChange={(catchUpEnabled) => update.mutate({ catchUpEnabled })}>
            Show a Catch-up
          </Switch>
          <p className="flex items-center gap-1.5 text-xs text-on-surface-subtle">
            <InfoIcon size={12} /> Works with Notifications off too.
          </p>
        </div>
      </Card>
    </section>
  );
}

/** The viewer's User settings, behind Settings in the account menu: Appearance, then Notifications. */
export function UserSettingsPage() {
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title="Settings" back={{ to: "/", label: "Back" }} />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <AppearanceCard />
        <BoardSizeCard />
        <NotificationSettings />
      </main>
    </div>
  );
}
