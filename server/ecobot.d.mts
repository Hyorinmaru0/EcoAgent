import type { IncomingMessage, ServerResponse } from "node:http"

export function ecoBotMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: Error) => void,
): void
