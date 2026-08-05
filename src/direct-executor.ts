import { KeeperHubError } from "./client.js";
import type { KeeperHubClient } from "./client.js";
import type {
  DirectCheckAndExecuteInput,
  DirectCheckAndExecuteResult,
  DirectContractCallInput,
  DirectExecutionStatus,
  DirectReadResult,
  DirectSimulationResult,
  DirectTransferInput,
  DirectWriteOptions,
  DirectWriteResult,
} from "./types.js";

/** Build the RequestInit for a Direct Execution write. */
function writeInit(input: object, opts?: DirectWriteOptions): RequestInit {
  const body =
    opts?.simulate === undefined
      ? { ...input }
      : { ...input, simulate: opts.simulate };
  const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
  if (opts?.idempotencyKey) {
    init.headers = { "Idempotency-Key": opts.idempotencyKey };
  }
  return init;
}

/**
 * Pull a human-readable reason out of an error body. Direct Execution puts a
 * sentence in `error` and structured context in `details`; the rest of the API
 * puts a stable code in `error`. Check both.
 */
function readErrorText(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.details === "string") return obj.details;
  if (typeof obj.message === "string") return obj.message;
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * DirectExecutor wraps KeeperHub's Direct Execution API — synchronous
 * blockchain operations that don't require a workflow definition.
 *
 * Unlike workflow execution, these endpoints accept all parameters explicitly
 * and skip the workflow engine entirely, making them the right surface for
 * agent tools that need to compose on-chain calls dynamically.
 *
 * All endpoints require an organization API key (kh_*).
 */
export class DirectExecutor {
  constructor(private readonly client: KeeperHubClient) {}

  /**
   * Transfer native tokens (omit tokenAddress) or ERC-20 tokens.
   *
   * Pass `{ idempotencyKey }` so a retry after a timeout replays the original
   * execution instead of sending a second transaction.
   */
  transfer(
    input: DirectTransferInput,
    opts?: DirectWriteOptions
  ): Promise<DirectWriteResult> {
    return this.client.rawRequest<DirectWriteResult>(
      "/execute/transfer",
      writeInit(input, opts)
    );
  }

  /**
   * Call a smart contract function.
   *
   * Read functions (view/pure) return synchronously with `{ result }`.
   * Write functions return `{ executionId, status }` and execute synchronously.
   * Use `isReadResult` to discriminate at the call site.
   */
  callContract(
    input: DirectContractCallInput,
    opts?: DirectWriteOptions
  ): Promise<DirectReadResult | DirectWriteResult> {
    return this.client.rawRequest<DirectReadResult | DirectWriteResult>(
      "/execute/contract-call",
      writeInit(input, opts)
    );
  }

  /** Read a value, evaluate a condition, conditionally execute a write. */
  checkAndExecute(
    input: DirectCheckAndExecuteInput,
    opts?: DirectWriteOptions
  ): Promise<DirectCheckAndExecuteResult> {
    return this.client.rawRequest<DirectCheckAndExecuteResult>(
      "/execute/check-and-execute",
      writeInit(input, opts)
    );
  }

  /** Simulate a transfer without broadcasting it. */
  simulateTransfer(
    input: DirectTransferInput
  ): Promise<DirectSimulationResult> {
    return this.simulate("/execute/transfer", input);
  }

  /** Simulate a contract call without broadcasting it. */
  simulateContractCall(
    input: DirectContractCallInput
  ): Promise<DirectSimulationResult> {
    return this.simulate("/execute/contract-call", input);
  }

  /**
   * Run a Direct Execution call with `simulate: true` and return the verdict.
   *
   * The API answers a would-revert simulation with HTTP 400 and
   * `wouldRevert: true`. That is a real answer about the chain, not a
   * transport failure, so it is returned rather than thrown. Anything else
   * still throws.
   */
  private async simulate(
    path: string,
    input: object
  ): Promise<DirectSimulationResult> {
    try {
      const res = await this.client.rawRequest<unknown>(
        path,
        writeInit(input, { simulate: true })
      );
      const obj = asRecord(res) ?? {};
      return {
        success: obj.success === true,
        wouldRevert: obj.wouldRevert === true,
        error: readErrorText(obj),
        raw: res,
      };
    } catch (err) {
      const khErr = err instanceof KeeperHubError ? err : undefined;
      const obj = asRecord(khErr?.body);
      if (obj?.wouldRevert === true) {
        return {
          success: false,
          wouldRevert: true,
          error: readErrorText(obj),
          raw: khErr?.body,
        };
      }
      throw err;
    }
  }

  /** Status of a direct execution by its id. */
  getStatus(executionId: string): Promise<DirectExecutionStatus> {
    return this.client.rawRequest<DirectExecutionStatus>(
      `/execute/${executionId}/status`
    );
  }
}

export function isReadResult(
  res: DirectReadResult | DirectWriteResult
): res is DirectReadResult {
  return "result" in res;
}
