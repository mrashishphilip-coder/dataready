# DataReady

A readiness check an AI agent calls **before** it answers a metric question.

> Agents don't fail because they lack data. They fail because nothing checks whether a metric is fit for *this* request, *right now*: the right definition, a finished period, complete coverage, passing quality checks, and access.

**How it works.** An AI model interprets the question into a structured request (metric, period, regions, channels). Deterministic code then decides:

- **READY**: returns the value, the definition used, and the evidence, bound to this request.
- **CLARIFY**: the wording fits more than one definition, or the period is missing; the person asking chooses.
- **BLOCKED**: the data can't support a reliable answer for this scope, with the reasons.

The model never makes the readiness decision.

## Run it

Requires Node.js 22 or later.

```bash
npm install
npm start          # playground at http://localhost:4173
npm test           # engine unit tests
npm run eval       # experiment, rules arm (no API key needed)
```

To use the AI interpreter and agents, copy `.env.example` to `.env` and add an OpenAI API key (default model `gpt-5.5`) or an Anthropic API key (default `claude-opus-5-5`). Only `src/llm.js` knows which provider is in use. Then:

```bash
npm run eval -- --arms llm,baseline,gated
```

## The experiment

Does a company need this at all? `evals/` runs 41 labeled questions through:

| Arm | What it is |
|---|---|
| `baseline` | AI agent with metric definitions, a semantic-layer style query tool, a data-health tool and a careful prompt: the cheapest thing a company could do today |
| `rules` | DataReady with a keyword interpreter (no model) |
| `llm` | DataReady with the AI interpreter |
| `gated` | AI agent whose only data tool is DataReady |

Scored on **false approvals** (a number given when it should have asked or declined), **wrong numbers**, and **unnecessary blocks**. Results: [`evals/RESULTS.md`](evals/RESULTS.md).

## Write-ups

- [`FINDINGS.md`](FINDINGS.md): what the experiment found, in plain terms
- [`RECORDING.md`](RECORDING.md): how to record the 60-second demo (`npm start`, then open `/?replay=b10`)
- `case-study/`: the published case-study page (`node case-study/build.js` rebuilds it from the eval results)
- `prototype/`: the published prototype, the playground running fully in the browser (`node prototype/build.js`, then `npm test` checks it decides exactly like the server). Its AI interpreter asks Claude on the viewer's own account; the agent comparison replays the recorded eval runs

## Layout

| Path | What |
|---|---|
| `data/` | Fictional sample data, metric registry and [planted issues](data/PLANTED_ISSUES.md) |
| `src/engine.js` | The deterministic readiness engine |
| `src/interpret-rules.js`, `src/interpret-llm.js` | The two interpreters |
| `src/llm.js` | The only provider-specific code (OpenAI or Anthropic) |
| `src/agents.js` | Baseline and gated agents for the experiment |
| `evals/` | Questions, independent ground truth, runner, results |
| `public/index.html`, `server.js` | Playground |
