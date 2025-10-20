/**
 * Creates a standardised AbortError instance. The optional reason is preserved
 * when provided by upstream signals.
 */
export function createAbortError(reason?: unknown): Error {
  if (reason instanceof DOMException && reason.name === "AbortError") return reason;
  if (reason instanceof Error) {
    // Don't mutate name; wrap instead
    const err = new DOMException(reason.message || "Aborted", "AbortError");
    (err as any).cause = reason;
    return err;
  }
  return new DOMException("Aborted", "AbortError");
}
/**
 * Forwards abort events from the source signal to the target controller. A
 * cleanup function is returned so callers can remove the listener once the
 * operation completes.
 */
export function forwardAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController
): () => void {
  if (!source) {
    return () => {};
  }

  if (source.aborted) {
    target.abort(source.reason);
    return () => {};
  }

  const abortListener = () => {
    if (!target.signal.aborted) {
      target.abort(source.reason);
    }
  };

  source.addEventListener("abort", abortListener, { once: true });
  return () => {
    source.removeEventListener("abort", abortListener);
  };
}
