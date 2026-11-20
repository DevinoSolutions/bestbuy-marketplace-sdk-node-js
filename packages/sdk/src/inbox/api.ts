import type {
  InboxApi,
  InboxReplyInput,
  InboxReplyReceipt,
  InboxThread,
  InboxThreadList,
  InboxThreadParams,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  inboxReplyReceiptSchema,
  inboxThreadListSchema,
  inboxThreadSchema,
  parseWith,
} from "../schemas/wire.js";
import { joinList, requireNonEmptyArray, requireNonEmptyString } from "../schemas/inputs.js";

/**
 * Builds the `inbox` namespace. `threads`, `thread` and `downloadAttachment` are READS.
 *
 * `reply` is a WRITE: it posts a message that is delivered to a real customer. The owner now
 * wants replies to go through the SDK, so it exists, but it is classified `write` in
 * `operations.ts` (and therefore forbidden in the live read-only suite) and nothing here ever
 * calls it on its own.
 */
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

    async thread(threadId: string, options?: RequestOptions): Promise<InboxThread> {
      const id = requireNonEmptyString(threadId, "threadId", "inbox.thread");
      const raw = await http.requestJson(
        { operation: "inbox.thread", pathParams: { thread_id: id } },
        options,
      );
      return parseWith(inboxThreadSchema, raw, "inbox thread");
    },

    // WRITE. Delivers a message to a real customer; it cannot be recalled.
    async reply(
      threadId: string,
      input: InboxReplyInput,
      options?: RequestOptions,
    ): Promise<InboxReplyReceipt> {
      const id = requireNonEmptyString(threadId, "threadId", "inbox.reply");
      const body = requireNonEmptyString(input?.body, "body", "inbox.reply");
      const recipients = input.to ?? [{ type: "CUSTOMER" }];
      requireNonEmptyArray(recipients, "to", "inbox.reply");
      const to = recipients.map((recipient) => {
        const type = requireNonEmptyString(recipient?.type, "to.type", "inbox.reply");
        return recipient.id === undefined
          ? { type }
          : { type, id: requireNonEmptyString(recipient.id, "to.id", "inbox.reply") };
      });

      // VERIFIED live 2026-11-18: ONE multipart part named `message_input`, whose value is a
      // JSON Blob (`application/json`). The boundary-bearing Content-Type header is left to
      // fetch; see BestBuyHttpClient.send.
      const form = new FormData();
      form.append(
        "message_input",
        new Blob([JSON.stringify({ body, to })], { type: "application/json" }),
      );
      const raw = await http.requestJson(
        { operation: "inbox.reply", pathParams: { thread_id: id }, form },
        options,
      );
      // The message is already delivered at this point; an empty body is tolerated.
      return parseWith(inboxReplyReceiptSchema, raw ?? {}, "inbox reply");
    },

    async downloadAttachment(attachmentId: string, options?: RequestOptions): Promise<Uint8Array> {
      const id = requireNonEmptyString(attachmentId, "attachmentId", "inbox.downloadAttachment");
      return http.requestBytes(
        { operation: "inbox.downloadAttachment", pathParams: { attachment_id: id } },
        options,
      );
    },
  };
}
