// One-time AG Grid setup (docs/ag-grid-tables-plan.md): module registration and the shared theme. Imported once
// from main.tsx — a table component only needs to call useGridTheme(), never registers a module itself.
import { useMemo } from "react";
import {
  ModuleRegistry,
  enableDevValidations,
  themeQuartz,
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CheckboxEditorModule,
  CustomEditorModule,
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
import { useResolvedColorScheme } from "./colorScheme";

// Individually, not AllCommunityModule, to keep the bundle down (the client chunk is already ~1.2 MB).
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CheckboxEditorModule,
  // The signup roster's timezone picker (a React popup editor, not one of AG's own).
  CustomEditorModule,
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
const baseGridTheme = themeQuartz.withParams({
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

/**
 * The grid theme, with AG's own `browserColorScheme` param kept in sync with the app's live light/dark
 * preference. Every other param above is a CSS variable, so it already repaints correctly on its own when the
 * app's theme changes — this one doesn't, because it isn't a colour: it sets the actual CSS `color-scheme`
 * property on AG's own internal DOM, which is what tells the *browser* whether to render that DOM's native
 * controls (checkboxes, and critically the internal scrollbar AG relies on the browser for — see
 * core/mod/SignupRosterGrid.tsx's own scrollbar investigation) in light or dark chrome. Unset, AG defaults it to
 * light regardless of the app's own theme — that's why the grid's scrollbar didn't match the page's.
 */
export function useGridTheme() {
  const scheme = useResolvedColorScheme();
  return useMemo(() => baseGridTheme.withParams({ browserColorScheme: scheme }), [scheme]);
}
