export function PageLoading() {
  return <div className="flex min-h-screen items-center justify-center text-on-surface-muted">Loading…</div>;
}

export function PageError({ message }: { message: string }) {
  return <div className="flex min-h-screen items-center justify-center text-danger">{message}</div>;
}
