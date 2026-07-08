import { afterEach, describe, expect, it, vi } from "vitest";
import { PccApiError, PccClient } from "../src/pccClient.js";

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      json: async () => body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PccClient", () => {
  it("builds the search URL with query and page params", async () => {
    mockFetchOnce({ total: 1, hits: 1, records: [] });
    const client = new PccClient({ baseUrl: "https://example.test/api" });

    await client.searchByTitle("台北市政府", 2);

    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as URL;
    expect(calledUrl.toString()).toBe(
      "https://example.test/api/searchbytitle?query=%E5%8F%B0%E5%8C%97%E5%B8%82%E6%94%BF%E5%BA%9C&page=2",
    );
  });

  it("returns parsed JSON on success", async () => {
    const payload = { total: 1, hits: 1, records: [] };
    mockFetchOnce(payload);
    const client = new PccClient({ baseUrl: "https://example.test/api" });

    const result = await client.searchByTitle("test");

    expect(result).toEqual(payload);
  });

  it("throws PccApiError on non-ok response", async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const client = new PccClient({ baseUrl: "https://example.test/api" });

    await expect(client.searchByTitle("test")).rejects.toThrow(PccApiError);
  });

  it("throws PccApiError when the request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );
    const client = new PccClient({
      baseUrl: "https://example.test/api",
      timeoutMs: 5,
    });

    await expect(client.searchByTitle("test")).rejects.toThrow(PccApiError);
  });
});
