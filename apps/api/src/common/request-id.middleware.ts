import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";

type Request = { headers: Record<string, string | string[] | undefined>; requestId?: string };
type Response = { setHeader(name: string, value: string): void };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: () => void) {
    const supplied = request.headers["x-request-id"];
    const requestId = typeof supplied === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(supplied) ? supplied : randomUUID();
    request.requestId = requestId;
    request.headers["x-request-id"] = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  }
}
