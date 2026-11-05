import type { IncomingMessage, ServerResponse } from "node:http"
export function authApiMiddleware(req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void): void
