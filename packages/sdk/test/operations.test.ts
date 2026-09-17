import { describe, expect, it } from "vitest";
import { OPERATIONS, isWriteOperation, writeOperationNames } from "../src/operations.js";

describe("operation table", () => {
  it("classifies exactly the known mutating surface as WRITE", () => {
    // This list is the contract the live-suite read-only guard is built on. Growing the
    // mutating surface means changing this test in the same change — on purpose.
    expect(writeOperationNames()).toEqual(
      [
        "offers.importFile",
        "offers.update",
        "orders.accept",
        "orders.ship",
        "orders.setTracking",
        "products.importFile",
      ].sort(),
    );
  });

  it("classifies every read endpoint as GET", () => {
    for (const [name, spec] of Object.entries(OPERATIONS)) {
      if (spec.access === "read") expect(spec.method, name).toBe("GET");
    }
  });

  it("gives every operation a Mirakl code and an /api path", () => {
    for (const [name, spec] of Object.entries(OPERATIONS)) {
      expect(spec.code, name).toMatch(/^[A-Z]+\d+$/);
      expect(spec.path, name).toMatch(/^\/api\//);
    }
  });

  it("agrees with isWriteOperation", () => {
    expect(isWriteOperation("offers.update")).toBe(true);
    expect(isWriteOperation("offers.list")).toBe(false);
  });
});
