import type { IncomingMessage, ServerResponse } from "node:http"

export function createTvDetectionMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: Error) => void,
) => void
