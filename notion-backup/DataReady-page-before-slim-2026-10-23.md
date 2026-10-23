<!-- Backup of the Notion page "DataReady" before it was slimmed to a landing page on 23 Oct 2026.
     Page: https://app.notion.com/p/3fad82c7501480ec9abcdc0ba12bc12f · last edited 2026-10-23.
     Notion-flavored Markdown, exactly as fetched. -->

<callout icon="⏱️" color="gray_bg">
<b>30-second summary</b>

- <b>User:</b> anyone asking an internal AI agent a metric question, and the metric owner who has to trust the answer
- <b>Bet:</b> the model interprets the question, deterministic code decides whether the answer is ready, and the person asking resolves ambiguity
- <b>Key decision:</b> test it against the cheapest thing a company could do today: a careful agent with the same model, catalogue, query tool and data-observability tool
- <b>Result:</b> 0 false approvals with the gate across 41 questions × 3 runs. The careful agent scored 39–40 of 41, but gave the same wrong number on the same question every run. The gate also used 23% fewer input tokens
- <b>What I got wrong:</b> the baseline caught my gate over-blocking. I fixed it, relabeled, and re-ran everything
- <b>Next test:</b> 20 real questions labeled by real metric owners
</callout>

When an AI agent answers "what was revenue last week?", the number can be wrong in ways nobody sees: "revenue" meant the Sales definition, one region's rows never landed, yesterday's load is still running, an upstream quality check failed. I built DataReady, a readiness check an agent calls before answering, and then tested whether a careful agent even needs it.

<b>Independent prototype.</b> I scoped the problem, designed the experiment and wrote the labels, then built it with AI coding assistance. Node.js, no frameworks; OpenAI gpt-5.5 for interpretation and the agents; fictional retail data with seven planted problems.

## Read the case study, try the prototype, see the code

[DataReady case study, with recorded agent runs →](https://claude.ai/artifact/BTtv6hzA5s1XyByfGL3db9)

[Try the working prototype →](https://claude.ai/artifact/UNvaDo9YreN36fV4Uiny3T) Ask a metric question and see whether it's ready, needs clarifying or is blocked, with every check shown. It runs in your browser and includes the recorded runs of both agents for all 41 questions.

[View the code on GitHub →](https://github.com/mrashishphilip-coder/dataready) The engine, tests, the 41 labeled questions and every recorded run, so each number on this page can be checked.

<callout icon="🎬" color="gray_bg">
Placeholder: 60-second screen recording of the side-by-side replay.
</callout>

## The problem

The tools to catch each failure exist: semantic layers for definitions, observability tools for data health, catalogues for certification. They sit in different places, and nothing combines them for one specific request at the moment an agent answers. An analyst carries that context in their head. An agent doesn't.

## Options I considered

| Option | Catches | Misses |
| --- | --- | --- |
| Semantic layer only | Definitions, access | Gaps, partial loads, failed checks, ambiguity |
| Certified flags in the catalogue | Draft metrics | Anything specific to the request |
| Careful prompt + observability tool | Most issues, when the agent weighs them correctly | A warning the model sees but treats as a footnote |
| <b>Pre-flight readiness check</b> | Request-specific fitness, enforced in code | Can only judge the request it's given |

I built the last one and tested it against the third.

## How it works

A model turns the question into a structured request: metric, period, regions, channels. It lists every metric the words could mean instead of picking one. Then eight deterministic checks run, scoped to that request: meaning, certification, access (before any data is read), period, completeness, coverage, column-aware quality checks, and freshness. The result is READY with the value and evidence, CLARIFY with options, or BLOCKED with reasons.

## Evals

I wrote 41 questions against fictional retail data with seven planted problems, and labeled the right response to each before running anything: 19 should get a number, 10 should ask the person to clarify, 12 should be declined. For every question that should get a number, the correct value comes from the raw data, calculated independently of DataReady's engine.

I count the two errors separately, because they cost different things:

- <b>False approval:</b> a number given when it should have asked or declined. This is the dangerous error, and the one a pilot must not have.
- <b>Unnecessary block:</b> asking or declining when a clean answer existed. This is the annoying error. A gate that blocks too often gets switched off.

Some of the cases I included:

- <b>"Revenue" is ambiguous:</b> Finance and Sales define it differently, about 15% apart. Ask the person to choose; never pick one silently.
- <b>A silent gap:</b> South has no rows for 19 October, but the load is marked complete. Any total that includes it must be declined.
- <b>A problem outside the scope:</b> "Online orders yesterday" is fine even though yesterday's store load is still pending. Blocking it would be an unnecessary block.
- <b>A check that doesn't apply:</b> West's returns check failed on 14 October. Net revenue for that week must be declined, but orders and average order value don't use returns, so they should be answered.
- <b>Access:</b> a Sales user asking for Finance's net revenue is declined before any data is read.

Each AI setup ran all 41 questions three times, because model output varies from run to run and one run is an anecdote. The baseline agent got the same model, metric catalogue, synonyms and calendar conventions as DataReady, so the only difference between the two was the gate.

## What the experiment found

| Setup | Correct of 41 | False approvals | Tokens per question |
| --- | --- | --- | --- |
| Agent + DataReady | 41 (3 of 3 runs) | 0 | \~2,000 in / 210 out |
| Agent without the gate | 39–40 | 1, same question every run | \~2,600 in / 290 out |
| DataReady with keyword rules, no model | 37 | 0, but 4 wrong numbers | none |

<b>The careful agent saw the warning and answered anyway.</b> On "Online GMV for the last 7 days", it called the data-health tool, which reported a missing South check for 19 October. Its query scanned 27 rows where 28 were expected. In one run it wrote the problem into its answer. Then it reported ₹44,75,299, about 3.3% short, in all three runs.

A prompt is advice. A gate is policy.

## What I got wrong

- <b>The gate was over-blocking.</b> In the first run, the baseline answered two questions DataReady had blocked, store orders and AOV in a week when West's returns check failed, because neither metric uses returns. It was right. I made the quality check column-aware, relabeled both questions and re-ran everything.
- <b>A gate only judges the request it's given.</b> With keyword rules, four date ranges were read as single days. The data for those days was clean, so every check passed on the wrong scope. The model interpreter fixed all four, and every answer now shows what was understood.
- <b>My first baseline was handicapped.</b> It lacked the synonyms and calendar conventions the interpreter had. All reported numbers are from the fair version.

## What would stop me

If real metric owners' questions show a careful agent matching the gate, this isn't worth building. If it is, it belongs inside a semantic layer or catalogue as a feature, not as a standalone product.

<toggle>
Build notes and verification

15 unit tests on the readiness engine. 41 labeled questions (version 2, with a logged change from version 1), each AI setup run three times on gpt-5.5, with ground truth computed independently from the raw data. Every tool call is recorded in the results files. Limits: synthetic data, one model, my own labels.
</toggle>

<toggle>
Earlier versions · superseded

The rebuild above replaces these. Kept for reference.

<embed source="notion-file-block://5abe059d-de35-47f2-a3fb-c67c65a3e732/f687356f-3377-4e45-9312-bab7cb367011?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-v2.html">
DataReady v2 — interactive workflow
</embed>

<embed source="notion-file-block://f8c5bdf4-4a1b-41a9-95d9-f79330b4f308/b2566258-595a-4b2f-9205-659d61e3e551?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-prototype.html">
DataReady — interactive agent data preflight
</embed>

<video source="notion-file-block://33c1cf28-4a49-4b4a-a63f-472893797216/9d6072dc-7981-4839-b630-5dcd0a5c0b3b?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-narrated-launch.mp4">
DataReady — narrated launch film
</video>
</toggle>
