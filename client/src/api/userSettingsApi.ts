// User settings (shared userSettings.ts): the viewer's own, kept on their account and changed on the Settings page.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { BOARD_SIZE_DEVICES, DEFAULT_USER_SETTINGS, type UserSettings, type UserSettingsPatch } from "@bingo/shared";
import { api } from "./client";
import { useAuth } from "../context/AuthContext";

export const userSettingsKeys = {
  settings: () => ["userSettings"] as const,
};

// The last settings this browser saw, so the Board is drawn at its size from the first frame rather than jumping once
// the request answers. Only ever a starting point: the server's copy replaces it.
const storageKey = (userId: string) => `userSettings:${userId}`;
function remembered(userId: string): UserSettings | undefined {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as UserSettings) : undefined;
  } catch {
    return undefined;
  }
}
function remember(userId: string, settings: UserSettings) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the next load just waits for the server.
  }
}

/** The viewer's User settings: every default until they've loaded (or for someone signed out). */
export function useUserSettings(): UserSettings {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: userSettingsKeys.settings(),
    queryFn: async () => {
      const settings = await api.get<UserSettings>("/api/me/settings");
      if (user) remember(user.id, settings);
      return settings;
    },
    enabled: !!user,
    placeholderData: user ? remembered(user.id) : undefined,
    staleTime: 5 * 60_000,
  });
  // Settings remembered before one existed (Animations) don't have it: the default until the server's arrive.
  return data ? { ...DEFAULT_USER_SETTINGS, ...data } : DEFAULT_USER_SETTINGS;
}

/** The patch applied to `settings`, as the server applies it. */
function applyPatch(settings: UserSettings, patch: UserSettingsPatch): UserSettings {
  const boardSize = { ...settings.boardSize };
  for (const device of BOARD_SIZE_DEVICES) {
    const change = patch.boardSize?.[device];
    if (change) boardSize[device] = { ...boardSize[device], ...change };
  }
  return { ...settings, boardSize };
}

/** Shows `patch` at once, without saving it: a slider's every step, before it's let go of. */
export function previewUserSettings(queryClient: QueryClient, patch: UserSettingsPatch) {
  queryClient.setQueryData<UserSettings>(userSettingsKeys.settings(), (current) => applyPatch(current ?? DEFAULT_USER_SETTINGS, patch));
}

const MUTATION_KEY = ["updateUserSettings"] as const;
// The saves waiting their turn: each request goes out once the one before it has answered (or failed).
let saves: Promise<unknown> = Promise.resolve();
function save(patch: UserSettingsPatch): Promise<UserSettings> {
  const next = saves.catch(() => undefined).then(() => api.put<UserSettings>("/api/me/settings", patch));
  saves = next;
  return next;
}

/**
 * Saves a change, showing it at once; a refused one goes back to what the server has. Saves go one at a time, in order
 * (a slider's arrow keys save on every press), and only the last one's answer is shown: an earlier one's would put
 * back a value the viewer has already moved on from.
 */
export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: save,
    onMutate: (patch) => {
      previewUserSettings(queryClient, patch);
      void queryClient.cancelQueries({ queryKey: userSettingsKeys.settings() });
    },
    onSuccess: (settings) => {
      if (user) remember(user.id, settings);
      // This one still counts as running: any more means a later save is on its way.
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      queryClient.setQueryData(userSettingsKeys.settings(), settings);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: userSettingsKeys.settings() }),
  });
}
