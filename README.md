# @keeperhub/sdk

Official REST SDK for the [KeeperHub](https://keeperhub.com) API.

A stateless, typed HTTP client for calling KeeperHub from backend services, ops scripts, CI, and multi-tenant SaaS. One-shot calls, predictable error envelopes, no session ceremony.

> **Agent / framework users:** if you are building on an agent framework (Eliza, OpenClaw, Cursor, Claude Desktop), point your MCP client at `https://app.keeperhub.com/mcp` instead. The REST SDK is the convenience layer for non-agent integrations. See the docs for guidance on which surface fits your use case.

## Status

Early development (`0.x`). The public surface and REST contract are still stabilizing and may change between minor versions until `1.0`.

## Install

```bash
npm install @keeperhub/sdk
```

## Quickstart

```ts
import { KeeperHubClient, DirectExecutor } from "@keeperhub/sdk";

const client = new KeeperHubClient({ apiKey: process.env.KEEPERHUB_API_KEY! });
const direct = new DirectExecutor(client);

const res = await direct.transfer({
  network: "sepolia",
  recipientAddress: "0xabc...",
  amount: "0.0001",
});

console.log(res.executionId, res.status);
```

The API key is an organization key beginning with `kh_`. Keep it in the environment, never in source.

## Direct Execution

Direct Execution runs a single on-chain operation without a workflow definition. It is the right surface for agent tools that compose calls at runtime.

| Method | Endpoint | Returns |
| --- | --- | --- |
| `transfer` | `POST /execute/transfer` | `{ executionId, status }` |
| `callContract` | `POST /execute/contract-call` | `{ result }` for view functions, `{ executionId, status }` for writes |
| `checkAndExecute` | `POST /execute/check-and-execute` | condition verdict plus an optional execution |
| `getStatus` | `GET /execute/{id}/status` | status, `transactionHash`, `transactionLink` |

A contract call auto-detects read versus write, so the return type is a union. Use `isReadResult` to narrow it.

### Simulate before you broadcast

```ts
const verdict = await direct.simulateTransfer({
  network: "sepolia",
  recipientAddress: "0xabc...",
  amount: "0.0001",
});

if (!verdict.success || verdict.wouldRevert === true) {
  console.error(verdict.error);
  return;
}

if (verdict.wouldRevert === undefined) {
  // Nothing was simulated, so this is not a green light. On
  // simulateCheckAndExecute it means the condition was not met, or the action
  // is read-only. Read verdict.executed and verdict.conditionResult to see why.
  return;
}
```

A simulation that reports the call would revert is an answer about the chain, not a transport failure. `simulateTransfer` and `simulateContractCall` return that answer as a value; anything else still throws `KeeperHubError`.

Compare `wouldRevert` against `true` and `undefined` explicitly rather than testing it for truthiness. Absent means the endpoint never encoded a call, which is a different answer from a call it checked and found safe, and treating the two alike lets a later broadcast run a write the dry run never examined.

### Make a retry safe

```ts
await direct.transfer(input, { idempotencyKey: "payout-2026-08-05-0001" });
```

Replaying the same key with the same body returns the original execution instead of sending a second transaction. Keys are scoped to your organization for 24 hours. Any client-side retry, backoff, or crash-recovery path that moves funds should set one.

## License

[Apache-2.0](./LICENSE)
