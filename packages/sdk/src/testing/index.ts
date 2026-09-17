/**
 * Deterministic mock `fetch` for testing integrations without network access. Matches routes
 * by method + path pattern, records each call (with parsed JSON body and headers), and
 * returns `Response` objects built from the route's reply. Exported from
 * `@devino/bestbuy-marketplace-sdk/testing`.
 */

/** A single recorded request as observed by the mock. */
export interface RecordedCall {
  method: string;
  url: URL;
  headers: Headers;
  bodyText?: string;
  bodyJson?: unknown;
  /** Present when the request carried a multipart body. */
  form?: FormData;
}

/** The reply a route produces for a matched request. */
export interface MockReply {
  status: number;
  /** Objects and arrays are JSON-encoded; strings are sent verbatim. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** A route: matched by `method` plus `pathPattern`. */
export interface MockRoute {
  method: string;
  /** String = substring of the pathname; RegExp = tested against pathname + search. */
  pathPattern: RegExp | string;
  reply: (req: RecordedCall) => MockReply | Promise<MockReply>;
}

/** A mock `fetch` plus the log of everything it was asked to do. */
export interface MockFetch {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
}

type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

function toUrl(input: FetchInput): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return new URL(input.toString());
  return new URL(input.url);
}

function methodOf(input: FetchInput, init: FetchInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function headersOf(input: FetchInput, init: FetchInit): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (input instanceof Request) return new Headers(input.headers);
  return new Headers();
}

function matchPath(pattern: RegExp | string, url: URL): boolean {
  if (typeof pattern === "string") return url.pathname.includes(pattern);
  return pattern.test(`${url.pathname}${url.search}`);
}

function serializeBody(body: unknown): string {
  if (body === undefined) return "";
  return typeof body === "string" ? body : JSON.stringify(body);
}

/**
 * Builds a mock `fetch` from a route table. The first matching route wins; an unmatched
 * request rejects, so a test can never silently hit the real network.
 */
export function createMockFetch(routes: readonly MockRoute[]): MockFetch {
  const calls: RecordedCall[] = [];

  const fetchImpl = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = toUrl(input);
    const method = methodOf(input, init);
    const headers = headersOf(input, init);

    const call: RecordedCall = { method, url, headers };
    const body = init?.body;
    if (typeof body === "string") {
      call.bodyText = body;
      try {
        call.bodyJson = JSON.parse(body) as unknown;
      } catch {
        // Not JSON; bodyText is enough.
      }
    } else if (body instanceof FormData) {
      call.form = body;
    }
    calls.push(call);

    const route = routes.find(
      (r) => r.method.toUpperCase() === method && matchPath(r.pathPattern, url),
    );
    if (!route) {
      throw new Error(`No mock route matched ${method} ${url.pathname}${url.search}`);
    }

    const reply = await route.reply(call);
    const isJson = reply.body !== undefined && typeof reply.body !== "string";
    const replyHeaders = new Headers(reply.headers ?? {});
    if (isJson && !replyHeaders.has("content-type")) {
      replyHeaders.set("content-type", "application/json");
    }
    const payload = serializeBody(reply.body);
    return new Response(reply.status === 204 || payload === "" ? null : payload, {
      status: reply.status,
      headers: replyHeaders,
    });
  };

  return { fetch: fetchImpl as typeof globalThis.fetch, calls };
}
