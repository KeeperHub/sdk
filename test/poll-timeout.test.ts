import { describe, it, expect } from "vitest";
import { KeeperHubClient } from "../src/index.js";

describe("KeeperHubClient.pollUntilDone", () => {
  it("times out cleanly when the execution never reaches a terminal state", async () => {
    let pollCount = 0;
    const stubFetch = (async (
      _url: string | URL,
      _init?: RequestInit
    ): Promise<Response> => {
      pollCount++;
      return new Response(
        JSON.stringify({
          status: "running",
          nodeStatuses: [],
          progress: {
            totalSteps: 0,
            completedSteps: 0,
            runningSteps: 0,
            percentage: 0,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = new KeeperHubClient({
      apiKey: "kh_fake",
      baseUrl: "https://stub.local/api",
      fetch: stubFetch,
    });

    const start = Date.now();
    let thrown: unknown;
    try {
      await client.pollUntilDone("exec_stub", {
        intervalMs: 50,
        timeoutMs: 200,
      });
    } catch (err) {
      thrown = err;
    }
    const elapsed = Date.now() - start;

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/exec_stub/);
    expect(message).toMatch(/200ms|200 ms|timeout/i);
    expect(pollCount).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(1200);
  });

  it("returns the terminal status when the executor reports done on the first poll", async () => {
    const happyFetch = (async (
      url: string | URL,
      _init?: RequestInit
    ): Promise<Response> => {
      const path = String(url);
      if (/\/status$/.test(path)) {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ logs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new KeeperHubClient({
      apiKey: "kh_fake",
      baseUrl: "https://stub.local/api",
      fetch: happyFetch,
    });

    const result = await client.pollUntilDone("exec_happy", {
      intervalMs: 50,
      timeoutMs: 5_000,
    });

    expect(result.status).toBe("success");
    expect(result.executionId).toBe("exec_happy");
    expect(Array.isArray(result.logs)).toBe(true);
  });
});
