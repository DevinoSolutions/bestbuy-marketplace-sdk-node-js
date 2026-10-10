import type { InboxApi, InboxThreadList, InboxThreadParams, RequestOptions } from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import { inboxThreadListSchema, parseWith } from "../schemas/wire.js";
import { joinList } from "../schemas/inputs.js";

/** Builds the `inbox` namespace. Read-only: there is deliberately no way to reply here. */
export function createInboxApi(http: BestBuyHttpClient): InboxApi {
  return {
    async threads(params?: InboxThreadParams, options?: RequestOptions): Promise<InboxThreadList> {
      const query: Record<string, QueryValue> = {};
      if (params?.entityType !== undefined) query.entity_type = params.entityType;
      const entityIds = joinList(params?.entityIds);
      if (entityIds !== undefined) query.entity_id = entityIds;
      if (params?.updatedSince !== undefined) query.updated_since = params.updatedSince;
      if (params?.withMessages !== undefined) query.with_messages = params.withMessages;
      if (params?.limit !== undefined) query.limit = params.limit;
      if (params?.pageToken !== undefined) query.page_token = params.pageToken;
      const raw = await http.requestJson({ operation: "inbox.threads", query }, options);
      return parseWith(inboxThreadListSchema, raw, "inbox thread list");
    },
  };
}
