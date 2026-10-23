<!-- Backup of the Notion page "DataReady" (under AP - Portfolio) before it was replaced on 22 Oct 2026.
     Page: https://app.notion.com/p/3fad82c7501480ec9abcdc0ba12bc12f · last edited 2026-10-20.
     Notion-flavored Markdown, exactly as fetched. Uploaded files are referenced by notion-file-block:// links,
     which are kept on the new page in the "Earlier versions" toggle. -->

<callout icon="⏱️" color="gray_bg">
<b>30-second summary</b>

- <b>User:</b> analytics engineer or metric owner reviewing a metric before an agent uses it
- <b>Bet:</b> one review that shows the definition, quality checks and freshness together is worth more than checking them across separate tools
- <b>Key decision:</b> an assessment applies only to the request and evidence it was made on; if either changes, it needs a fresh review
- <b>Status:</b> interactive prototype with synthetic data and rule-based checks; no metric owners have tested it yet
- <b>Next test:</b> replay recent reviews with metric owners and compare preparation time, missed issues and unnecessary blocks
- <b>What would stop me:</b> if an existing platform already handles the review well, I would integrate rather than build a standalone product
</callout>

I built DataReady around a question that comes before an agent answers a business query: which metric should it use, and is the underlying data ready?

I wanted the metric owner to see the definition, quality checks and freshness together, and understand why a request could or could not proceed.

<b>Independent prototype.</b> I scoped and designed the workflow, then built it with AI coding assistance using synthetic data.

## Try the demo

Assess Finance net revenue, switch to the Sales definition, then edit the data. The definition affects the calculation; changing the evidence requires a fresh assessment.

<embed source="notion-file-block://5abe059d-de35-47f2-a3fb-c67c65a3e732/f687356f-3377-4e45-9312-bab7cb367011?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-v2.html">
DataReady v2 — interactive workflow
</embed>

## The problem

Before an internal reporting agent uses a metric, someone needs to check what it means and whether the data is fit for the request. I designed this for the analytics engineer or metric owner doing that review across existing tools. The open question is how often they repeat this work and whether bringing it together saves enough effort.

## Keeping the scope manageable

I started with one request and one metric family. Adding catalogue discovery or automatic repairs would have made it harder to test the review itself.

The important constraint is that an assessment only applies to the request and evidence used to make it. If either changes, the owner needs to review it again.

## What changed during the build

The prototype checks CSV data, calculates separate revenue definitions and tracks missing evidence, versions and expiry. The role selector demonstrates access rules without connecting to an identity system.

I kept the readiness checks in code. AI may help interpret a request or gather the relevant evidence, but the decision still needs to follow the metric owner’s policy.

One issue became clear during the build: the source could become stale before the assessment expired. I added a check at approval time to catch that.

## Evals

I want to catch false approvals without making the product block every request. Two cases I would include:

- <b>“Revenue” is ambiguous:</b> Finance and Sales definitions are available. Ask the reviewer to choose before approving.
- <b>Evidence ages during review:</b> The source becomes stale after assessment. Block approval even if the assessment has not expired.

I haven't run these evals with metric owners yet. I'd ask them to label the expected decision, then count false approvals and unnecessary blocks separately. A false approval in the critical cases would stop me taking it into a pilot; valid requests also need to get through. If I add a model, I'd test its interpretation separately on examples it hasn't been tuned against.

## Is this useful enough to connect to real systems?

I would replay recent reviews with metric owners and compare preparation time, missed issues and unnecessary blocks with their current process. That should tell me whether live connectors are worth building.

If an existing platform already handles the review well, I would explore an integration. I have not established a case for a standalone product yet.

<toggle>
Build notes and verification

I made the readiness checks executable and bound each assessment to its request and evidence. The build checks CSV data, metric definitions, versions and expiry; a final policy check catches evidence that becomes stale during review. Access is simulated, with no warehouse or identity integration.

The shared v2 package passed 81 synthetic regression tests across all four projects, including mocked provider and server checks. This does not establish model accuracy or customer value. The demos use explicit rules; live-model evaluation, browser/export verification and hosted v2 deployment remain pending.
</toggle>

<toggle>
Earlier demos and films · superseded

These are earlier versions of the idea. The demo above reflects the current scope.

<embed source="notion-file-block://f8c5bdf4-4a1b-41a9-95d9-f79330b4f308/b2566258-595a-4b2f-9205-659d61e3e551?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-prototype.html">
DataReady — interactive agent data preflight
</embed>

<video source="notion-file-block://33c1cf28-4a49-4b4a-a63f-472893797216/9d6072dc-7981-4839-b630-5dcd0a5c0b3b?space_id=4c8fbd6d-1008-476f-9128-776378b1ced8&name=DataReady-narrated-launch.mp4">
DataReady — narrated launch film
</video>
</toggle>
