// The audit decision for every non-GET route, keyed "METHOD full/mount/path"
// (mount prefixes match server/src/index.ts's router.use calls). Checked by
// routeCoverage.test.ts against the actual Express router stacks — a route
// missing here (and not auditSkip()'d) fails that test, so a new mutation
// can't silently ship unaudited.
import type { AuditAction } from "@bingo/shared";

export const AUDITED_ROUTES: Record<string, AuditAction[]> = {
  // routes/bingos.ts, mounted at /api/bingos
  "POST /api/bingos/:slug/submissions": ["submission.created"],
  "POST /api/bingos/:slug/signup": ["signup.created"],
  "PATCH /api/bingos/:slug/signup": ["signup.updated"],
  "DELETE /api/bingos/:slug/signup": ["signup.withdrawn", "pairing.dissolved"],
  "POST /api/bingos/:slug/signup/pairing": ["pairing.requested", "pairing.accepted"],
  "DELETE /api/bingos/:slug/signup/pairing/:pairingId": ["pairing.cancelled"],
  "POST /api/bingos/:slug/signup/pairing/:pairingId/respond": ["pairing.declined", "pairing.accepted"],
  "POST /api/bingos/:slug/draft/pick": ["draft.pick"],
  "PUT /api/bingos/:slug/draft/ratings/:signupId": ["draft.rating_set"],
  "PUT /api/bingos/:slug/tiles/:tileId/tasks/:taskId/interest": ["team.tile_interest_set"],
  "PATCH /api/bingos/:slug/teams/:teamId": ["team.updated"],

  // routes/mod.ts, mounted at /api/bingos/:slug/mod
  "PATCH /api/bingos/:slug/mod/submissions/:id": ["submission.approved", "submission.rejected", "submission.review_undone"],
  "POST /api/bingos/:slug/mod/teams/:teamId/adjustments": ["points.adjusted"],
  "POST /api/bingos/:slug/mod/stage": ["stage.changed"],
  "POST /api/bingos/:slug/mod/draft/start": ["draft.started"],
  "POST /api/bingos/:slug/mod/draft/shuffle": ["draft.order_shuffled"],
  "PUT /api/bingos/:slug/mod/draft/order": ["draft.order_set"],
  "POST /api/bingos/:slug/mod/pairings": ["pairing.admin_paired"],
  "DELETE /api/bingos/:slug/mod/pairings/:id": ["pairing.unpaired"],
  "PATCH /api/bingos/:slug/mod/signups/:id/buyin": ["signup.buyin_marked"],
  "DELETE /api/bingos/:slug/mod/signups/:id": ["signup.withdrawn", "pairing.dissolved"],
  "POST /api/bingos/:slug/mod/dev/seed-signups": ["dev.signups_seeded"],
  "DELETE /api/bingos/:slug/mod/dev/signups": ["dev.signups_wiped"],

  // routes/admin.ts, mounted at /api/bingos/:slug/admin
  "PATCH /api/bingos/:slug/admin/settings": ["settings.updated"],
  "POST /api/bingos/:slug/admin/mods": ["moderator.added"],
  "DELETE /api/bingos/:slug/admin/mods/:userId": ["moderator.removed"],
  "POST /api/bingos/:slug/admin/categories": ["category.created"],
  "PATCH /api/bingos/:slug/admin/categories/:id": ["category.updated"],
  "DELETE /api/bingos/:slug/admin/categories/:id": ["category.deleted"],
  "POST /api/bingos/:slug/admin/tiles": ["tile.created"],
  "PATCH /api/bingos/:slug/admin/tiles/:id": ["tile.updated"],
  "DELETE /api/bingos/:slug/admin/tiles/:id": ["tile.deleted"],
  "POST /api/bingos/:slug/admin/tiles/:id/image": ["tile.updated"],
  "PATCH /api/bingos/:slug/admin/tiles/:id/bonus-points": ["tile.bonus_points_updated"],
  "POST /api/bingos/:slug/admin/tiles/:tileId/tasks": ["task.created"],
  "PATCH /api/bingos/:slug/admin/tasks/:id": ["task.updated"],
  "DELETE /api/bingos/:slug/admin/tasks/:id": ["task.deleted"],
  "POST /api/bingos/:slug/admin/lines/generate": ["line.generated"],
  "PATCH /api/bingos/:slug/admin/lines/:id": ["line.updated"],
  "DELETE /api/bingos/:slug/admin/lines/:id": ["line.deleted"],
  "POST /api/bingos/:slug/admin/questions": ["question.created"],
  "PATCH /api/bingos/:slug/admin/questions/:id": ["question.updated"],
  "DELETE /api/bingos/:slug/admin/questions/:id": ["question.deleted"],
  "POST /api/bingos/:slug/admin/questions/reorder": ["question.reordered"],
  "POST /api/bingos/:slug/admin/teams": ["team.created"],
  "PATCH /api/bingos/:slug/admin/teams/:id": ["team.updated"],
  "POST /api/bingos/:slug/admin/teams/:id/members": ["team.member_added"],
  "DELETE /api/bingos/:slug/admin/teams/:id": ["team.deleted"],
  "DELETE /api/bingos/:slug/admin/teams/:id/members/:userId": ["team.member_removed"],

  // routes/siteAdmin.ts, mounted at /api/admin
  "POST /api/admin/bingos": ["bingo.created"],
  "POST /api/admin/bingos/import": ["bingo.created", "settings.updated", "category.created", "tile.created", "task.created", "line.generated", "line.updated", "question.created"],
  "DELETE /api/admin/bingos/:id": ["bingo.deleted"],
  "PATCH /api/admin/users/:id": ["user.admin_changed"],
  "POST /api/admin/item-groups": ["item_group.created"],
  "PATCH /api/admin/item-groups/:id": ["item_group.updated"],
  "DELETE /api/admin/item-groups/:id": ["item_group.deleted"],
  "PATCH /api/admin/bug-reports/:id": ["bug_report.resolved"],

  // routes/bugReports.ts, mounted at /api/bug-reports
  "POST /api/bug-reports/": ["bug_report.created"],
};
