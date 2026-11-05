import type { IncomingMessage, ServerResponse } from "node:http"
export function facilityApiMiddleware(req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void): void
