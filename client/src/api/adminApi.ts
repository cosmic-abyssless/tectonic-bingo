import type {
  Bingo, BingoExportDocument, BingoLine, BingoModerator, BoardLine, CaptainCandidatesResponse, CreatePointAdjustmentResponse, GraphNode, GraphNodeInput, ItemGroup, SignupQuestion, Team, TeamMember, Tile,
  TileCategory, User,
} from "@bingo/shared";
import { api } from "./client";

// Plain typed wrappers around the admin API — not TanStack mutations, since
// most admin forms just need pending/error state local to the component and
// a refetch of whichever list changed. Every function here maps 1:1 to an
// admin route in server/src/routes/admin.ts or siteAdmin.ts.

export function createBingo(payload: { slug: string; name: string; description?: string; theme?: string; boardRows: number; boardCols: number }) {
  return api.post<{ bingo: Bingo }>("/api/admin/bingos", payload);
}
export function deleteBingo(id: string) {
  return api.delete(`/api/admin/bingos/${id}`);
}
// Always creates a brand-new bingo from a previously exported document —
// never overwrites an existing one.
export function importBingo(payload: { slug: string; name?: string; document: BingoExportDocument }) {
  return api.post<{ bingo: Bingo }>("/api/admin/bingos/import", payload);
}
export function setUserAdmin(userId: string, isAdmin: boolean) {
  return api.patch<{ user: User }>(`/api/admin/users/${userId}`, { isAdmin });
}
export function searchAllUsers(q: string) {
  return api.get<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
}

export function getItemGroups() {
  return api.get<{ itemGroups: ItemGroup[] }>("/api/admin/item-groups");
}
export function createItemGroup(payload: { name: string; description?: string; itemNames: string[] }) {
  return api.post<{ itemGroup: ItemGroup }>("/api/admin/item-groups", payload);
}
export function updateItemGroup(id: string, payload: Partial<{ name: string; description: string; itemNames: string[] }>) {
  return api.patch<{ itemGroup: ItemGroup }>(`/api/admin/item-groups/${id}`, payload);
}
export function deleteItemGroup(id: string) {
  return api.delete(`/api/admin/item-groups/${id}`);
}

const base = (slug: string) => `/api/bingos/${slug}/admin`;

// womGroupVerificationCode isn't on the Bingo type at all — the server never
// sends it back (bingoService.toPublicBingo), so it can only ever be written.
export function updateBingoSettings(slug: string, payload: Partial<Bingo> & { womGroupVerificationCode?: string }) {
  return api.patch<{ bingo: Bingo }>(`${base(slug)}/settings`, payload);
}
export function searchBingoUsers(slug: string, q: string) {
  return api.get<{ users: User[] }>(`${base(slug)}/users?q=${encodeURIComponent(q)}`);
}
export function exportBingo(slug: string) {
  return api.get<BingoExportDocument>(`${base(slug)}/export`);
}

export function getMods(slug: string) {
  return api.get<{ mods: BingoModerator[] }>(`${base(slug)}/mods`);
}
export function addMod(slug: string, userId: string) {
  return api.post<{ mod: BingoModerator }>(`${base(slug)}/mods`, { userId });
}
export function removeMod(slug: string, userId: string) {
  return api.delete(`${base(slug)}/mods/${userId}`);
}

export function createCategory(slug: string, payload: { label: string; colorHex?: string; sortOrder?: number }) {
  return api.post<{ category: TileCategory }>(`${base(slug)}/categories`, payload);
}
export function updateCategory(slug: string, id: string, payload: Partial<TileCategory>) {
  return api.patch<{ category: TileCategory }>(`${base(slug)}/categories/${id}`, payload);
}
export function deleteCategory(slug: string, id: string) {
  return api.delete(`${base(slug)}/categories/${id}`);
}

export function createTile(slug: string, payload: { name: string; boardRow: number; boardCol: number; categoryId?: string | null; hasFreezePeriod?: boolean; freezeDurationMinutes?: number; notes?: string }) {
  return api.post<{ tile: Tile }>(`${base(slug)}/tiles`, payload);
}
export function updateTile(slug: string, id: string, payload: Partial<Tile>) {
  return api.patch<{ tile: Tile }>(`${base(slug)}/tiles/${id}`, payload);
}
export function deleteTile(slug: string, id: string) {
  return api.delete(`${base(slug)}/tiles/${id}`);
}
export async function uploadTileImage(slug: string, id: string, file: File) {
  const fd = new FormData();
  fd.append("image", file);
  return api.postForm<{ tile: Tile }>(`${base(slug)}/tiles/${id}/image`, fd);
}

// A task is just a node that's a direct child of its tile's node.
export function createTask(slug: string, tileId: string, input: GraphNodeInput, sortOrder?: number) {
  return api.post<{ task: GraphNode }>(`${base(slug)}/tiles/${tileId}/tasks`, { ...input, sortOrder });
}
export function updateTask(slug: string, id: string, input: GraphNodeInput) {
  return api.patch<{ task: GraphNode }>(`${base(slug)}/tasks/${id}`, input);
}
export function deleteTask(slug: string, id: string) {
  return api.delete(`${base(slug)}/tasks/${id}`);
}

export function getLines(slug: string) {
  return api.get<{ lines: BoardLine[] }>(`${base(slug)}/lines`);
}
export function generateLines(slug: string, pointsPerLine?: number) {
  return api.post<{ lines: BingoLine[] }>(`${base(slug)}/lines/generate`, { pointsPerLine });
}
export function updateLine(slug: string, id: string, points: number) {
  return api.patch<{ line: BingoLine }>(`${base(slug)}/lines/${id}`, { points });
}
export function deleteLine(slug: string, id: string) {
  return api.delete(`${base(slug)}/lines/${id}`);
}

export function getQuestions(slug: string) {
  return api.get<{ questions: SignupQuestion[] }>(`${base(slug)}/questions`);
}
export function createQuestion(slug: string, payload: { prompt: string; type: SignupQuestion["type"]; optionsJson?: string; required?: boolean; sortOrder?: number }) {
  return api.post<{ question: SignupQuestion }>(`${base(slug)}/questions`, payload);
}
export function updateQuestion(slug: string, id: string, payload: Partial<SignupQuestion>) {
  return api.patch<{ question: SignupQuestion }>(`${base(slug)}/questions/${id}`, payload);
}
export function deleteQuestion(slug: string, id: string) {
  return api.delete(`${base(slug)}/questions/${id}`);
}
export function reorderQuestions(slug: string, orderedIds: string[]) {
  return api.post<{ questions: SignupQuestion[] }>(`${base(slug)}/questions/reorder`, { orderedIds });
}

export function getCaptainCandidates(slug: string) {
  return api.get<CaptainCandidatesResponse>(`${base(slug)}/captain-candidates`);
}
export function createTeam(slug: string, payload: { captainUserId: string; coCaptainUserId?: string | null; name?: string }) {
  return api.post<{ team: Team }>(`${base(slug)}/teams`, payload);
}
export function updateTeam(slug: string, id: string, payload: Partial<Team>) {
  return api.patch<{ team: Team }>(`${base(slug)}/teams/${id}`, payload);
}
export function deleteTeam(slug: string, id: string) {
  return api.delete(`${base(slug)}/teams/${id}`);
}
export function addTeamMember(slug: string, teamId: string, userId: string) {
  return api.post<{ member: TeamMember }>(`${base(slug)}/teams/${teamId}/members`, { userId });
}
export function removeTeamMember(slug: string, teamId: string, userId: string) {
  return api.delete(`${base(slug)}/teams/${teamId}/members/${userId}`);
}

