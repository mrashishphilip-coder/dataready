# DataReady: what the experiment found

*22 October 2026 · question set v2 · 41 labeled questions · model: OpenAI gpt-5.5 · AI arms run 3 times each*

## The question

When an AI agent answers "what was revenue last week?", what stops it from giving a confident number that's wrong because the data isn't fit for that request? And do you need a separate readiness check, or is a careful agent with good tools enough?

## The result in one table

| Setup | Correct (of 41) | Gave a number it shouldn't have | Didn't answer when it could have | Consistent across runs? |
|---|---|---|---|---|
| **Agent + DataReady gate** | **41** | **0** | **0** | Yes, 3 of 3 |
| DataReady + AI interpreter (no agent) | 41 | 0 | 0 | Yes, 3 of 3 |
| Agent without gate (careful baseline) | 39–40 | **1, the same question every run** | 0 | Same blind spot every run |
| DataReady + keyword rules (no AI) | 37 | 0 (but 4 wrong numbers, see finding 3) | 0 | Deterministic |

The baseline isn't a straw man. It has the same model, the same metric catalogue with synonyms, the same calendar conventions, a query tool, a data-observability tool, and a prompt telling it to decline when data is unreliable. The only difference is the gate.

## Finding 1: The careful agent saw the warning and answered anyway

**"Online GMV for the last 7 days"**: in all 3 runs, the baseline:

1. called the data-health tool, which reported *a missing South quality check on 19 October*;
2. queried the metric, which scanned **27 rows** where 7 days × 4 regions should give **28**;
3. mentioned the missing check in its reply, and still reported **₹44,75,299**.

The true figure is about ₹46.2 lakh. The answer was **3.3% short**: plausible enough that nobody would question it in a meeting.

**What this means:** a prompt is advice; a gate is policy. Observability tools surface the signal, but a model weighing many signals will sometimes treat a blocking problem as a footnote. DataReady turns "no rows for South on 19 Oct although the load is marked complete" into a hard BLOCKED with the reason attached, every time.

## Finding 2: The gate was safer *and* cheaper

| Per question | Input tokens | Output tokens | Tool calls |
|---|---|---|---|
| Baseline agent | ~2,600 | ~290 | usually 2–3 |
| Gated agent (including DataReady's interpreter call) | ~2,000 | ~210 | 1 |

About 23% fewer input tokens (and 27% fewer output tokens), one tool call instead of several, and no variance between runs. The safe path became the cheap path.

## Finding 3: A gate can only judge the request it's given

With keyword rules instead of an AI interpreter, DataReady scored 37/41: **zero false approvals, but four wrong numbers.** Every one was a date range ("from October 1 to October 7") read as a single day. The data for that day was clean, so every check passed on the wrong scope.

**What this means:** interpretation is its own risk, separate from data readiness. Two design responses:
- use the AI model for interpretation (41/41 across 3 runs);
- always show the person *what was understood* (metric, period, regions, channels) next to the answer. The playground does this on every result.

## Finding 4: The baseline caught a flaw in my own product

In the first run (v1), the baseline "wrongly" answered two questions DataReady had blocked: store orders and AOV for a week where West's *returns* check failed. Its reasoning: those metrics don't use returns. **It was right.** DataReady blocked whole region-days on any failed check, which is too coarse.

I fixed the engine (a failed check now blocks only metrics that use the affected columns), relabeled the two questions, gave the baseline the same synonyms and conventions the interpreter had, and re-ran everything. Version 1 results are archived in `evals/results/v1/`; the change is logged in `evals/questions.json`.

**What this means:** the baseline is a test of the product, not just a competitor. Over-blocking is a real cost: a gate that blocks too much gets switched off.

## What I'd conclude as a PM

1. **The problem is real but narrower than "agents are reckless".** A careful agent with good tools gets most questions right. The failure that remains is a well-instrumented signal being *seen and ignored*, and it repeats.
2. **The decision belongs in code, the interpretation in the model.** That split produced zero false approvals and zero unnecessary blocks.
3. **This should be a feature, not a standalone product.** It's a pre-flight check that belongs inside a semantic layer or data catalogue, where the definitions, quality results and access rules already live.
4. **The next test is real metric owners.** Replay 20 real questions from an analytics team's Slack, with their own labels, and measure false approvals, unnecessary blocks and whether they trust the "what was understood" panel.

## Limits

- Synthetic data with planted problems; real data fails in messier ways.
- 41 questions, 3 runs, one model (gpt-5.5). Enough to show the pattern, not to estimate a production error rate.
- The labels are mine. Finding 4 shows they can be wrong; independent labelers are the next step.
- No live warehouse, catalogue or identity integration.

## Reproduce

```bash
npm install
npm test
npm run eval -- --arms rules,llm,baseline,gated   # needs an API key in .env
node evals/aggregate.js
```

Full tables: [`evals/SUMMARY.md`](evals/SUMMARY.md). Per-run detail, including every tool call: `evals/results/`.
