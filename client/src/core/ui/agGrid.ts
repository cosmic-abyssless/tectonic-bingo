// One-time AG Grid setup (docs/ag-grid-tables-plan.md): module registration and the shared theme. Imported once
// from main.tsx — a table component only needs to import gridTheme, never registers a module itself.
import {
  ModuleRegistry,
  enableDevValidations,
  themeQuartz,
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CheckboxEditorModule,
  TooltipModule,
  QuickFilterModule,
  ExternalFilterModule,
  RowStyleModule,
  CellStyleModule,
  ColumnApiModule,
  EventApiModule,
  RenderApiModule,
  RowApiModule,
  GridStateModule,
} from "ag-grid-community";

// Individually, not AllCommunityModule, to keep the bundle down (the client chunk is already ~1.2 MB).
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CheckboxEditorModule,
  TooltipModule,
  QuickFilterModule,
  ExternalFilterModule,
  RowStyleModule,
  CellStyleModule,
  ColumnApiModule,
  EventApiModule,
  RenderApiModule,
  RowApiModule,
  GridStateModule,
]);

// Fails loudly (console + an on-grid overlay) on a missing module or misconfigured column, instead of the grid
// silently doing nothing. Dev only — this stays out of the production bundle's behaviour.
if (import.meta.env.DEV) enableDevValidations();

// Every value is one of the app's tokens (client/src/index.css) — never a literal colour, per the design-tokens
// rule. --color-surface-muted does not exist (tableChrome.tsx's STRIPE_ODD references it, which is a pre-existing
// bug — see the AG Grid plan doc); oddRowBackgroundColor here uses the real --color-surface-hover token instead.
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--color-surface)",
  foregroundColor: "var(--color-on-surface)",
  headerBackgroundColor: "var(--color-surface)",
  headerTextColor: "var(--color-on-surface-subtle)",
  borderColor: "var(--color-outline)",
  accentColor: "var(--color-accent)",
  oddRowBackgroundColor: "color-mix(in srgb, var(--color-surface-hover) 40%, transparent)",
  rowHoverColor: "var(--color-surface-hover)",
  fontFamily: "inherit",
  fontSize: "0.875rem",
  headerFontSize: "0.75rem",
  spacing: 6,
  rowHeight: 44,
  headerHeight: 40,
  borderRadius: 6,
  wrapperBorder: false,
  // A checked checkbox (the roster's "Buy-in received" column) reads as --color-ok green rather than the
  // theme's default accent-coloured check, so it stands out from the rest of the grid's UI at a glance.
  // --color-on-ok doesn't exist; --color-on-accent flips light/dark the same way --color-ok does, so it stays
  // readable against it in both themes.
  checkboxCheckedBackgroundColor: "var(--color-ok)",
  checkboxCheckedBorderColor: "var(--color-ok)",
  checkboxCheckedShapeColor: "var(--color-on-accent)",
});
