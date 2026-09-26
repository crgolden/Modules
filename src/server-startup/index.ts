export function startOnceRetryingFailures<T>(start: () => Promise<T>): () => Promise<T> {
  let started: Promise<T> | null = null;
  return () => {
    started ??= start().catch((error: unknown) => {
      started = null;
      throw error;
    });
    return started;
  };
}
