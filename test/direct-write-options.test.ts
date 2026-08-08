import { describe, it, expect } from "vitest";
import { KeeperHubClient, DirectExecutor } from "../src/index.js";
import type {
  DirectTransferInput,
  DirectCheckAndExecuteInput,
} from "../src/index.js";

const TRANSFER: DirectTransferInput = {
  network: "sepolia",
  recipientAddress: "0x0000000000000000000000000000000000000001",
  amount: "0.0001",
};

const CHECK_AND_EXECUTE: DirectCheckAndExecuteInput = {
  network: "sepolia",
  contractAddress: "0x0000000000000000000000000000000000000002",
  functionName: "balanceOf",
  condition: { operator: "gt", value: "50" },
  action: {
    network: "sepolia",
    contractAddress: "0x0000000000000000000000000000000000000003",
    functionName: "transfer",
  },
};

interface Capture {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function harness(
  respond: () => { status: number; payload: unknown }
): { executor: DirectExecutor; calls: Capture[] } {
  const calls: Capture[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body ?? "{}")),
    });
    const { status, payload } = respond();
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const client = new KeeperHubClient({ apiKey: "kh_test", fetch: fetchImpl });
  return { executor: new DirectExecutor(client), calls };
}

const ok = () => ({
  status: 200,
  payload: { executionId: "direct_1", status: "completed" },
});

describe("DirectExecutor write options", () => {
  it("sends no simulate key and no Idempotency-Key by default", async () => {
    const { executor, calls } = harness(ok);
    await executor.transfer(TRANSFER);
    expect("simulate" in calls[0].body).toBe(false);
    expect(calls[0].headers["Idempotency-Key"]).toBeUndefined();
  });

  it("sends simulate as a strict boolean when asked", async () => {
    const { executor, calls } = harness(ok);
    await executor.transfer(TRANSFER, { simulate: true });
    expect(calls[0].body.simulate).toBe(true);
  });

  it("sets the Idempotency-Key header without touching the body", async () => {
    const { executor, calls } = harness(ok);
    await executor.transfer(TRANSFER, { idempotencyKey: "abc-123" });
    expect(calls[0].headers["Idempotency-Key"]).toBe("abc-123");
    expect("idempotencyKey" in calls[0].body).toBe(false);
  });

  it("keeps the caller's input fields intact alongside the options", async () => {
    const { executor, calls } = harness(ok);
    await executor.transfer(TRANSFER, {
      simulate: true,
      idempotencyKey: "abc-123",
    });
    expect(calls[0].body.recipientAddress).toBe(TRANSFER.recipientAddress);
    expect(calls[0].body.amount).toBe("0.0001");
  });
});

describe("DirectExecutor.simulateTransfer", () => {
  it("returns a clean verdict on a successful simulation", async () => {
    const { executor, calls } = harness(() => ({
      status: 200,
      payload: { success: true, wouldRevert: false },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(calls[0].body.simulate).toBe(true);
    expect(verdict).toMatchObject({ success: true, wouldRevert: false });
  });

  it("returns a verdict instead of throwing when the call would revert", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: {
        wouldRevert: true,
        error:
          "Insufficient ETH balance. Have: 0.0, Need: 0.0001. Fund the wallet and retry.",
      },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(verdict.wouldRevert).toBe(true);
    expect(verdict.success).toBe(false);
    expect(verdict.error).toContain("Insufficient ETH balance");
  });

  it("reads details when the reason is not in error", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: { wouldRevert: true, details: "execution reverted: ERC20: bad" },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(verdict.error).toBe("execution reverted: ERC20: bad");
  });

  it("still throws on a real failure that is not a revert", async () => {
    const { executor } = harness(() => ({
      status: 401,
      payload: { error: "unauthorized" },
    }));
    await expect(executor.simulateTransfer(TRANSFER)).rejects.toThrow();
  });

  it("still throws on a 400 that carries no revert verdict", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: { error: "simulate must be a boolean" },
    }));
    await expect(executor.simulateTransfer(TRANSFER)).rejects.toThrow();
  });
});

const CHECK: DirectCheckAndExecuteInput = {
  network: "sepolia",
  contractAddress: "0x0000000000000000000000000000000000000002",
  functionName: "balanceOf",
  condition: { operator: "gte", value: "1000" },
  action: {
    network: "sepolia",
    contractAddress: "0x0000000000000000000000000000000000000003",
    functionName: "withdraw",
  },
};

describe("DirectExecutor.simulateCheckAndExecute", () => {
  it("simulates against the check-and-execute route", async () => {
    const { executor, calls } = harness(() => ({
      status: 200,
      payload: { success: true, wouldRevert: false },
    }));
    const verdict = await executor.simulateCheckAndExecute(CHECK);
    expect(calls[0].url).toContain("/execute/check-and-execute");
    expect(calls[0].body.simulate).toBe(true);
    expect(verdict).toMatchObject({ success: true, wouldRevert: false });
  });

  it("returns a verdict instead of throwing when the call would revert", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: { wouldRevert: true, error: "execution reverted: not ready" },
    }));
    const verdict = await executor.simulateCheckAndExecute(CHECK);
    expect(verdict.wouldRevert).toBe(true);
    expect(verdict.success).toBe(false);
    expect(verdict.error).toContain("not ready");
  });

  it("still throws on a failure that is not a revert", async () => {
    const { executor } = harness(() => ({
      status: 401,
      payload: { error: "unauthorized" },
    }));
    await expect(executor.simulateCheckAndExecute(CHECK)).rejects.toThrow();
  });
});

describe("DirectSimulationResult code and revertReason", () => {
  it("surfaces code and revertReason from the body", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: {
        wouldRevert: true,
        error: "Insufficient ETH balance. Have: 0.0, Need: 0.0001.",
        code: "INSUFFICIENT_BALANCE",
        revertReason: "execution reverted",
      },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(verdict.code).toBe("INSUFFICIENT_BALANCE");
    expect(verdict.revertReason).toBe("execution reverted");
  });

  it("reads them from details when they are nested there", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: {
        wouldRevert: true,
        details: {
          code: "GAS_TOO_LOW",
          revertReason: "execution reverted: ERC20: bad",
        },
      },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(verdict.code).toBe("GAS_TOO_LOW");
    expect(verdict.revertReason).toBe("execution reverted: ERC20: bad");
  });

  it("leaves both undefined when the server sends neither", async () => {
    const { executor } = harness(() => ({
      status: 200,
      payload: { success: true, wouldRevert: false },
    }));
    const verdict = await executor.simulateTransfer(TRANSFER);
    expect(verdict.code).toBeUndefined();
    expect(verdict.revertReason).toBeUndefined();
  });
});

describe("DirectSimulationResult distinguishes absent from false", () => {
  it("leaves wouldRevert undefined when the server omits it", async () => {
    const { executor } = harness(() => ({
      status: 200,
      payload: {
        success: true,
        status: "simulated",
        executed: false,
        conditionResult: { met: false },
      },
    }));

    const verdict = await executor.simulateCheckAndExecute(CHECK_AND_EXECUTE);

    expect(verdict.success).toBe(true);
    expect(verdict.wouldRevert).toBeUndefined();
    expect(verdict.executed).toBe(false);
  });

  it("surfaces the condition verdict so a caller knows why nothing ran", async () => {
    const { executor } = harness(() => ({
      status: 200,
      payload: {
        success: true,
        status: "simulated",
        executed: false,
        conditionResult: { met: false, observedValue: "10" },
      },
    }));

    const verdict = await executor.simulateCheckAndExecute(CHECK_AND_EXECUTE);

    expect(verdict.conditionResult).toMatchObject({ met: false });
  });

  it("still reports false when the server checked and found it safe", async () => {
    const { executor } = harness(() => ({
      status: 200,
      payload: { success: true, wouldRevert: false, executed: true },
    }));

    const verdict = await executor.simulateTransfer(TRANSFER);

    expect(verdict.wouldRevert).toBe(false);
  });

  it("still reports true on a would-revert 400", async () => {
    const { executor } = harness(() => ({
      status: 400,
      payload: { wouldRevert: true, revertReason: "ERC20: bad" },
    }));

    const verdict = await executor.simulateTransfer(TRANSFER);

    expect(verdict.wouldRevert).toBe(true);
    expect(verdict.revertReason).toBe("ERC20: bad");
  });
});
