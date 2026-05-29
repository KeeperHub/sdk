# @keeperhub/sdk

Official REST SDK for the [KeeperHub](https://keeperhub.com) API.

A stateless, typed HTTP client for calling KeeperHub from backend services, ops scripts, CI, and multi-tenant SaaS. One-shot calls, predictable error envelopes, no session ceremony.

> **Agent / framework users:** if you are building on an agent framework (Eliza, OpenClaw, Cursor, Claude Desktop), point your MCP client at `https://app.keeperhub.com/mcp` instead. The REST SDK is the convenience layer for non-agent integrations. See the docs for guidance on which surface fits your use case.

## Status

Early development. The package is not yet published. The public surface and REST contract are still stabilizing.

## Install

```bash
npm install @keeperhub/sdk
```

## License

[Apache-2.0](./LICENSE)
