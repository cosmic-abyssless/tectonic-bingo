// The audit decision for every non-GET route, keyed "METHOD full/mount/path"
// (mount prefixes match server/src/index.ts's router.use calls). Checked by
// routeCoverage.test.ts against the actual Express router stacks — a route
// missing here (and not auditSkip()'d) fails that test, so a new mutation
// can't silently ship unaudited.
import type { AuditAction } from "@bingo/shared";

export const AUDITED_ROUTES: Record<string, AuditAction[]> = {
  // mcp/router.ts, mounted at the site root. Each tool call is audited; the OAuth endpoints are auditSkip()'d there.
  "POST /mcp": ["mcp.tool_called"],

  // routes/bingos.ts, mounted at /api/bingos
  "POST /api/bingos/:slug/submissions": ["submission.created"],
  "POST /api/bingos/:slug/signup": ["signup.created"],
  "PATCH /api/bingos/:slug/signup": ["signup.updated"],
  "DELETE /api/bingos/:slug/signup": ["signup.withdrawn", "pairing.dissolved"],
  "POST /api/bingos/:slug/signup/pairing": ["pairing.requested", "pairing.accepted"],
  "DELETE /api/bingos/:slug/signup/pairing/:pairingId": ["pairing.cancelled"],
  "POST /api/bingos/:slug/signup/pairing/:pairingId/respond": ["pairing.declined", "pairing.accepted"],
  "POST /api/bingos/:slug/draft/pick": ["draft.pick"],
  "POST /api/bingos/:slug/draft/undo": ["draft.pick_undone"],
  "PUT /api/bingos/:slug/draft/ratings/:signupId": ["draft.rating_set", "draft.note_set"],
  "PUT /api/bingos/:slug/tiles/:tileId/tasks/:taskId/interest": ["team.tile_interest_set"],
  "PUT /api/bingos/:slug/submissions/:id/reactions": ["submission.reaction_set"],
  "PATCH /api/bingos/:slug/teams/:teamId": ["team.updated"],

  // routes/mod.ts, mounted at /api/bingos/:slug/mod
  "PATCH /api/bingos/:slug/mod/submissions/:id/attribution": ["submission.attribution_changed"],
  "POST /api/bingos/:slug/mod/submissions/:id/reprice": ["submission.repriced"],
  "PATCH /api/bingos/:slug/mod/submissions/:id": ["submission.approved", "submission.rejected", "submission.review_undone", "points.earned", "points.lost", "wrapped.published"],
  "POST /api/bingos/:slug/mod/teams/:teamId/adjustments": ["points.adjusted"],
  "POST /api/bingos/:slug/mod/stage": ["stage.changed", "wrapped.published"],
  "POST /api/bingos/:slug/mod/wrapped/publish": ["wrapped.published", "wrapped.republished"],
  "POST /api/bingos/:slug/mod/draft/start": ["draft.started"],
  "POST /api/bingos/:slug/mod/draft/shuffle": ["draft.order_shuffled"],
  "PUT /api/bingos/:slug/mod/draft/order": ["draft.order_set"],
  "POST /api/bingos/:slug/mod/pairings": ["pairing.admin_paired"],
  "DELETE /api/bingos/:slug/mod/pairings/:id": ["pairing.unpaired"],
  "POST /api/bingos/:slug/mod/signups/:signupId/refresh-stats": ["signup.name_changed", "signup.stats_fetched", "signup.stats_fetch_failed"],
  "PATCH /api/bingos/:slug/mod/signups/:id/buyin": ["signup.buyin_marked"],
  "PATCH /api/bingos/:slug/mod/signups/:id/timezone": ["signup.timezone_set"],
  "DELETE /api/bingos/:slug/mod/signups/:id": ["signup.withdrawn", "pairing.dissolved"],

  // routes/buyins.ts, mounted at /api/bingos/:slug/buyins
  "PATCH /api/bingos/:slug/buyins/:signupId": ["signup.buyin_marked"],

  // routes/admin.ts, mounted at /api/bingos/:slug/admin
  "PATCH /api/bingos/:slug/admin/settings": ["settings.updated", "points.rescored"],
  "POST /api/bingos/:slug/admin/mods": ["moderator.added"],
  "DELETE /api/bingos/:slug/admin/mods/:userId": ["moderator.removed"],
  "POST /api/bingos/:slug/admin/staff": ["staff.added"],
  "DELETE /api/bingos/:slug/admin/staff/:userId": ["staff.removed"],
  "POST /api/bingos/:slug/admin/categories": ["category.created"],
  "PATCH /api/bingos/:slug/admin/categories/:id": ["category.updated"],
  "DELETE /api/bingos/:slug/admin/categories/:id": ["category.deleted"],
  "POST /api/bingos/:slug/admin/tiles": ["tile.created", "points.rescored"],
  "PATCH /api/bingos/:slug/admin/tiles/:id": ["tile.updated", "points.rescored"],
  "DELETE /api/bingos/:slug/admin/tiles/:id": ["tile.deleted", "points.rescored"],
  "POST /api/bingos/:slug/admin/tiles/:id/image": ["tile.updated"],
  "POST /api/bingos/:slug/admin/wrapped-art/:group": ["wrapped.art_set"],
  "PUT /api/bingos/:slug/admin/wrapped-art/:group/order": ["wrapped.art_reordered"],
  "PUT /api/bingos/:slug/admin/wrapped-art/:group/credits": ["wrapped.credits_set"],
  "PUT /api/bingos/:slug/admin/wrapped-art/images/:id/credit": ["wrapped.art_credit_set"],
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id": ["wrapped.art_set"],
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id/recut": ["wrapped.art_recut"],
  "DELETE /api/bingos/:slug/admin/wrapped-art/images/:id": ["wrapped.art_removed"],
  "PATCH /api/bingos/:slug/admin/tiles/:id/bonus-points": ["tile.bonus_points_updated", "points.rescored"],
  "POST /api/bingos/:slug/admin/tiles/:tileId/tasks": ["task.created", "points.rescored"],
  "PATCH /api/bingos/:slug/admin/tasks/:id": ["task.updated", "points.rescored"],
  "DELETE /api/bingos/:slug/admin/tasks/:id": ["task.deleted", "points.rescored"],
  "POST /api/bingos/:slug/admin/nodes/:nodeId/reprice": ["submission.repriced"],
  "POST /api/bingos/:slug/admin/lines/generate": ["line.generated", "points.rescored"],
  "PATCH /api/bingos/:slug/admin/lines/:id": ["line.updated", "points.rescored"],
  "DELETE /api/bingos/:slug/admin/lines/:id": ["line.deleted", "points.rescored"],
  "POST /api/bingos/:slug/admin/questions": ["question.created"],
  "PATCH /api/bingos/:slug/admin/questions/:id": ["question.updated"],
  "DELETE /api/bingos/:slug/admin/questions/:id": ["question.deleted"],
  "POST /api/bingos/:slug/admin/questions/reorder": ["question.reordered"],
  "POST /api/bingos/:slug/admin/superlatives": ["superlative.category_created"],
  "PATCH /api/bingos/:slug/admin/superlatives/:id": ["superlative.category_updated"],
  "DELETE /api/bingos/:slug/admin/superlatives/:id": ["superlative.category_deleted"],
  "POST /api/bingos/:slug/admin/superlatives/reorder": ["superlative.category_reordered"],
  "POST /api/bingos/:slug/admin/teams": ["team.created"],
  "PATCH /api/bingos/:slug/admin/teams/:id": ["team.updated"],
  "POST /api/bingos/:slug/admin/teams/:id/members": ["team.member_added"],
  "DELETE /api/bingos/:slug/admin/teams/:id": ["team.deleted"],
  "DELETE /api/bingos/:slug/admin/teams/:id/members/:userId": ["team.member_removed", "signup.withdrawn", "pairing.dissolved"],
  "POST /api/bingos/:slug/admin/late-signups": ["signup.created", "team.member_added"],
  // Cut review scoring (POST .../admin/cut-review/score) is a read-only calculation (auditSkip), not listed here.
  "POST /api/bingos/:slug/admin/cut-review/apply": ["pairing.admin_paired", "pairing.unpaired", "team.created", "team.deleted", "draft.cut_review_applied"],

  // routes/historicalScreenshots.ts, mounted at /api/bingos/:slug/admin/historical. No entry per screenshot: one when
  // the last pending one is attached.
  "POST /api/bingos/:slug/admin/historical/screenshots/:key": ["bingo.historical_screenshots_attached"],

  // routes/siteAdmin.ts, mounted at /api/admin
  "POST /api/admin/bingos": ["bingo.created"],
  "POST /api/admin/bingos/import": ["bingo.created", "settings.updated", "category.created", "tile.created", "task.created", "line.generated", "line.updated", "question.created"],
  "DELETE /api/admin/bingos/:id": ["bingo.deleted"],
  "POST /api/admin/historical-bingos": ["bingo.historical_imported"],
  "PATCH /api/admin/users/:id": ["user.admin_changed", "mcp.connection_revoked"],
  "DELETE /api/admin/mcp-connections/:id": ["mcp.connection_revoked"],
  "POST /api/admin/item-groups": ["item_group.created"],
  "PATCH /api/admin/item-groups/:id": ["item_group.updated"],
  "DELETE /api/admin/item-groups/:id": ["item_group.deleted"],
  "POST /api/admin/piece-values": ["piece_value.created"],
  "PATCH /api/admin/piece-values/:id": ["piece_value.updated"],
  "DELETE /api/admin/piece-values/:id": ["piece_value.deleted"],
  "PUT /api/admin/unvalued-items/dismissed": ["piece_value.item_dismissed", "piece_value.item_restored"],
  "PUT /api/admin/title-settings": ["title_settings.updated"],
  "POST /api/admin/wom-competitions": ["wom_past_competition.added"],
  "PATCH /api/admin/wom-competitions/:id": ["wom_past_competition.renamed"],
  "DELETE /api/admin/wom-competitions/:id": ["wom_past_competition.deleted"],
  "PATCH /api/admin/bug-reports/:id": ["bug_report.status_changed"],

  // routes/bugReports.ts, mounted at /api/bug-reports
  "POST /api/bug-reports/": ["bug_report.created"],
};
