/**
 * Mirakl paginates every list endpoint the same way: `max` records starting at `offset`,
 * with `total_count` in the body. These helpers centralize the arithmetic so each module API
 * only has to know how to fetch one page.
 */
import type { Page, PageParams } from "./types.js";
import { BestBuyValidationError } from "./errors/index.js";

/** Largest page size Mirakl accepts. Larger values are rejected before the request is sent. */
export const MAX_PAGE_SIZE = 100;

/** Page size used when the caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 100;

/** A validated `max`/`offset` pair. */
export interface ResolvedPageParams {
  max: number;
  offset: number;
}

/** Validates and defaults the paging parameters of a list call. */
export function normalizePageParams(
  params: PageParams | undefined,
  context: string,
): ResolvedPageParams {
  const max = params?.max ?? DEFAULT_PAGE_SIZE;
  const offset = params?.offset ?? 0;
  if (!Number.isInteger(max) || max < 1 || max > MAX_PAGE_SIZE) {
    throw new BestBuyValidationError(`Invalid paging parameters for ${context}`, {
      issues: [
        { path: "max", message: `must be an integer between 1 and ${MAX_PAGE_SIZE}`, code: "max" },
      ],
    });
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new BestBuyValidationError(`Invalid paging parameters for ${context}`, {
      issues: [{ path: "offset", message: "must be an integer >= 0", code: "offset" }],
    });
  }
  return { max, offset };
}

/**
 * Walks every page of a list endpoint and yields the records one at a time.
 *
 * Stops on the first empty page, when the reported `total_count` is reached, or when a page
 * comes back short — any of the three means there is nothing left, and all three together
 * mean a misreported `total_count` cannot spin this into an infinite loop.
 */
export async function* paginate<T>(
  fetchPage: (params: ResolvedPageParams) => Promise<Page<T>>,
  params: PageParams | undefined,
  context: string,
): AsyncIterableIterator<T> {
  const { max } = normalizePageParams(params, context);
  let offset = params?.offset ?? 0;

  for (;;) {
    const page = await fetchPage({ max, offset });
    for (const item of page.items) yield item;
    if (page.items.length === 0 || page.items.length < max) return;
    offset += page.items.length;
    if (offset >= page.totalCount) return;
  }
}
