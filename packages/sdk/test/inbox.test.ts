/**
 * Inbox reads (M10 thread, M13 attachment download) and the M12 reply WRITE, all through the
 * public API with a mocked fetch. Every id and string below is a made-up placeholder; the M12
 * request shape (one multipart `message_input` JSON part) is the one VERIFIED live on
 * 2026-11-18, and the M13 path was VERIFIED live on 2026-11-20.
 */
import { describe, expect, it } from "vitest";
import { BestBuyApiError, BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, route, TEST_API_KEY } from "./helpers.js";

const thread = {
  id: "thread-1",
  topic: { type: "FREE_TEXT", value: "Question about an order" },
  entities: [{ id: "ORDER-1", type: "MMP_ORDER", label: "Order ORDER-1" }],
  current_participants: [{ id: "cust-1", type: "CUSTOMER", display_name: "A. Customer" }],
  messages: [{ id: "msg-1", body: "hello", from: { type: "SHOP_USER" } }],
};

describe("inbox.thread (M10)", () => {
  it("GETs one thread by id", async () => {
    const { client, calls } = harness([
      route("GET", /^\/api\/inbox\/threads\/thread-1$/, 200, thread),
    ]);
    const result = await client.inbox.thread("thread-1");
    expect(result.id).toBe("thread-1");
    expect(result.messages?.[0]?.id).toBe("msg-1");
    const call = onlyCall(calls);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/api/inbox/threads/thread-1");
  });

  it("encodes the id and refuses an empty one", async () => {
    const { client, calls } = harness([route("GET", /^\/api\/inbox\/threads\//, 200, thread)]);
    await client.inbox.thread("a/b");
    expect(onlyCall(calls).url.pathname).toBe("/api/inbox/threads/a%2Fb");
    await expect(client.inbox.thread("")).rejects.toBeInstanceOf(BestBuyValidationError);
  });
});

describe("inbox.reply (M12)", () => {
  const replyPath = /^\/api\/inbox\/threads\/thread-1\/message$/;

  it("POSTs multipart with ONE application/json `message_input` part", async () => {
    const { client, calls } = harness([route("POST", replyPath, 201, { id: "msg-2", extra: 1 })]);
    const receipt = await client.inbox.reply("thread-1", {
      body: "Thanks, a refund is on its way.",
    });

    const call = onlyCall(calls);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/api/inbox/threads/thread-1/message");
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

    expect(receipt.id).toBe("msg-2");
    expect(receipt.extra).toBe(1);
  });

  it("passes explicit recipients through, including an id", async () => {
    const { client, calls } = harness([route("POST", replyPath, 201, { id: 77 })]);
    const receipt = await client.inbox.reply("thread-1", {
      body: "hi",
      to: [{ type: "CUSTOMER", id: "cust-1" }, { type: "OPERATOR" }],
    });
    const blob = onlyCall(calls).form?.get("message_input") as Blob;
    expect(JSON.parse(await blob.text())).toEqual({
      body: "hi",
      to: [{ type: "CUSTOMER", id: "cust-1" }, { type: "OPERATOR" }],
    });
    expect(receipt.id).toBe(77);
  });

  it("tolerates an empty 201 body (the message is already delivered)", async () => {
    const { client } = harness([route("POST", replyPath, 201)]);
    await expect(client.inbox.reply("thread-1", { body: "hi" })).resolves.toEqual({});
  });

  it("maps an upstream failure to an API error and never retries", async () => {
    const { client, calls } = harness([route("POST", replyPath, 500, { message: "boom" })]);
    await expect(client.inbox.reply("thread-1", { body: "hi" })).rejects.toBeInstanceOf(
      BestBuyApiError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["empty thread id", "", { body: "hi" }],
    ["empty body", "thread-1", { body: "   " }],
    ["no recipients", "thread-1", { body: "hi", to: [] }],
    ["recipient without a type", "thread-1", { body: "hi", to: [{ type: "" }] }],
    ["empty recipient id", "thread-1", { body: "hi", to: [{ type: "CUSTOMER", id: "" }] }],
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
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
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
    expect([...got]).toEqual([0, 1, 2, 250, 255]);
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
