/**
 * Inbox reads (M10 thread, M13 attachment download) and the M12 reply WRITE, all through the
 * public API with a mocked fetch. Every id and string below is a made-up placeholder; the M12
 * request shape (one multipart `message_input` JSON part) is the one VERIFIED live on
 * 2026-11-18, and the M13 path was VERIFIED live on 2026-11-20.
 *
 * Fixtures are REAL responses captured live on 2026-11-20 (the M10 thread after a reply, and
 * the M12 receipt) with every name, id, date, e-mail address and message body replaced by a
 * fake value; structure, types and key order are the captured ones. `inbox-attachment.png` is
 * a tiny fake image: a real attachment is never stored.
 */
import { describe, expect, it } from "vitest";
import { BestBuyApiError, BestBuyValidationError } from "../src/errors/index.js";
import {
  harness,
  onlyCall,
  readFixture,
  readFixtureBytes,
  route,
  TEST_API_KEY,
} from "./helpers.js";

const thread = readFixture("inbox-thread");
const THREAD_ID = "11111111-1111-4111-8111-111111111111";

describe("inbox.thread (M10)", () => {
  it("GETs one thread by id", async () => {
    const { client, calls } = harness([
      route("GET", new RegExp(`^/api/inbox/threads/${THREAD_ID}$`), 200, thread),
    ]);
    const result = await client.inbox.thread(THREAD_ID);
    expect(result.id).toBe(THREAD_ID);
    expect(result.messages).toHaveLength(4);
    expect(result.messages?.[0]?.from?.type).toBe("CUSTOMER_USER");
    // The customer's message with an image carries its attachment ids.
    expect(result.messages?.[2]?.attachments?.[0]).toMatchObject({ name: "image.png", size: 1024 });
    expect(result.metadata?.shop_reply_needed_since).toBeNull();
    expect(result.current_participants?.map((p) => p.type)).toEqual(["CUSTOMER", "SHOP"]);
    const call = onlyCall(calls);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe(`/api/inbox/threads/${THREAD_ID}`);
  });

  it("encodes the id and refuses an empty one", async () => {
    const { client, calls } = harness([route("GET", /^\/api\/inbox\/threads\//, 200, thread)]);
    await client.inbox.thread("a/b");
    expect(onlyCall(calls).url.pathname).toBe("/api/inbox/threads/a%2Fb");
    await expect(client.inbox.thread("")).rejects.toBeInstanceOf(BestBuyValidationError);
  });
});

describe("inbox.reply (M12)", () => {
  const replyPath = new RegExp(`^/api/inbox/threads/${THREAD_ID}/message$`);

  it("POSTs multipart with ONE application/json `message_input` part", async () => {
    const { client, calls } = harness([
      route("POST", replyPath, 201, readFixture("inbox-reply-response")),
    ]);
    const receipt = await client.inbox.reply(THREAD_ID, {
      body: "Thanks, a refund is on its way.",
    });

    const call = onlyCall(calls);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe(`/api/inbox/threads/${THREAD_ID}/message`);
    // Auth is attached, but no hand-set Content-Type: fetch adds the multipart boundary.
    expect(call.headers.get("authorization")).toBe(TEST_API_KEY);
    expect(call.headers.has("content-type")).toBe(false);
    expect(call.bodyText).toBeUndefined();

    const form = call.form;
    expect(form).toBeInstanceOf(FormData);
    expect([...(form?.keys() ?? [])]).toEqual(["message_input"]);
    const part = form?.get("message_input");
    expect(part).toBeInstanceOf(Blob);
    const blob = part as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual({
      body: "Thanks, a refund is on its way.",
      to: [{ type: "CUSTOMER" }],
    });

    expect(receipt).toEqual({
      message_id: "44444444-4444-4444-8444-444444444444",
      thread_id: THREAD_ID,
    });
  });

  it("passes explicit recipients through, including an id", async () => {
    const { client, calls } = harness([
      route("POST", replyPath, 201, { message_id: "m-77", note: "kept" }),
    ]);
    const receipt = await client.inbox.reply(THREAD_ID, {
      body: "hi",
      to: [{ type: "CUSTOMER", id: "cust-1" }, { type: "OPERATOR" }],
    });
    const blob = onlyCall(calls).form?.get("message_input") as Blob;
    expect(JSON.parse(await blob.text())).toEqual({
      body: "hi",
      to: [{ type: "CUSTOMER", id: "cust-1" }, { type: "OPERATOR" }],
    });
    expect(receipt.message_id).toBe("m-77");
    expect(receipt.note).toBe("kept");
  });

  it("tolerates an empty 201 body (the message is already delivered)", async () => {
    const { client } = harness([route("POST", replyPath, 201)]);
    await expect(client.inbox.reply(THREAD_ID, { body: "hi" })).resolves.toEqual({});
  });

  it("maps an upstream failure to an API error and never retries", async () => {
    const { client, calls } = harness([route("POST", replyPath, 500, { message: "boom" })]);
    await expect(client.inbox.reply(THREAD_ID, { body: "hi" })).rejects.toBeInstanceOf(
      BestBuyApiError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["empty thread id", "", { body: "hi" }],
    ["empty body", THREAD_ID, { body: "   " }],
    ["no recipients", THREAD_ID, { body: "hi", to: [] }],
    ["recipient without a type", THREAD_ID, { body: "hi", to: [{ type: "" }] }],
    ["empty recipient id", THREAD_ID, { body: "hi", to: [{ type: "CUSTOMER", id: "" }] }],
  ])("refuses %s before any request is made", async (_label, threadId, input) => {
    const { client, calls } = harness([route("POST", /^\/api\/inbox/, 201, { id: "x" })]);
    await expect(
      client.inbox.reply(threadId, input as unknown as Parameters<typeof client.inbox.reply>[1]),
    ).rejects.toBeInstanceOf(BestBuyValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("inbox.downloadAttachment (M13)", () => {
  it("GETs the download path and returns the exact bytes", async () => {
    const seen: { url: string; accept: string | null }[] = [];
    const bytes = readFixtureBytes("inbox-attachment.png");
    const { client } = harness([], {
      fetch: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        seen.push({
          url: String(input),
          accept: new Headers(init?.headers).get("accept"),
        });
        return new Response(bytes, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      }) as typeof fetch,
    });
    const got = await client.inbox.downloadAttachment("att-9");
    expect(got).toBeInstanceOf(Uint8Array);
    expect([...got]).toEqual([...bytes]);
    // PNG signature: the bytes came through untouched, not re-encoded as text.
    expect([...got.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new URL(seen[0]?.url ?? "").pathname).toBe("/api/inbox/threads/att-9/download");
    expect(seen[0]?.accept).toContain("application/octet-stream");
  });

  it("reports a failure as an API error and refuses an empty id", async () => {
    const { client, calls } = harness([route("GET", /\/download$/, 404, { message: "nope" })]);
    await expect(client.inbox.downloadAttachment("att-9")).rejects.toBeInstanceOf(BestBuyApiError);
    await expect(client.inbox.downloadAttachment("")).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
    expect(calls).toHaveLength(1);
  });
});
