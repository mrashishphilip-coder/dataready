# Recording the 60–90 second demo

The replay plays back a **real recorded eval run** (question B10, run 1 of 3). Nothing is re-run, so it looks identical every time and costs no API credit.

## Setup (2 minutes)

1. Start the playground: open a terminal in `Desktop\Code\dataready` and run `npm start`.
2. Open **http://localhost:4173/?replay=b10** in your browser.
3. Make the browser window about 1280 × 800, zoom to 100%, and close other tabs and notifications (Windows: Focus assist on).
4. Optional: add `&speed=0.8` to the address for a slower pace if you'll talk over it.

## Record

1. Press **Win + Shift + R** (Snipping Tool's screen recorder) and drag a box around the browser content.
2. Click **Start**, wait one second, then click **▶ Play** on the page.
3. The sequence runs about **62 seconds**. Scroll down gently around the 25-second mark so both answers and the tool steps are in view.
4. When the last caption appears ("A prompt is advice. A gate is policy."), hold for 3 seconds, then stop recording.
5. Snipping Tool saves an MP4 under `Videos\Screen Recordings`.

## What's on screen, and what you could say

| Time | On screen | Voice-over (optional) |
|---|---|---|
| 0–5 s | "One question. Two AI agents." · the question appears | "Same question, two AI agents." |
| 5–9 s | "Same model, same catalogue, same tools. One difference…" | "Same model, same tools. The one on the right has to ask DataReady before it answers." |
| 10–15 s | DataReady's agent: one call → **DECLINED** | "DataReady blocks it: South has no rows for 19 October, even though the load says complete." |
| 19–27 s | Baseline: data-health check → query → **ANSWERED ₹44,75,299** | "The other agent checks data health, queries, and gives a confident number." |
| 32–45 s | Highlights: *1 missing check run*, *27 rows*, *"was missing"* | "It saw the warning. It scanned 27 of 28 rows. It even wrote the problem down. And answered anyway. About 3% short: nobody would notice." |
| 46–57 s | The right response was to decline · same wrong number in 3 of 3 runs | "Same wrong number every run. With the gate: zero false approvals across 41 questions." |
| 58–62 s | "A prompt is advice. A gate is policy." | "A prompt is advice. A gate is policy." |

That's about 60 seconds. Add a 5–10 second intro or outro ("I'm Ashish, I build AI data products. Here's an experiment…") to reach 70–90 seconds.

## LinkedIn post draft

> I gave two AI agents the same question: "Online GMV for the last 7 days?"
>
> Same model. Same metric catalogue. Same data-health tool. One difference: one had to pass a readiness check first.
>
> The agent without it checked data health, saw a missing check for one region-day, scanned 27 of 28 expected rows, wrote the problem down… and answered anyway. 3.3% short. Every run.
>
> The gated agent declined and said exactly why.
>
> Across 41 labeled questions × 3 runs: 0 false approvals with the gate. The ungated agent was good, 39–40 of 41, but its one miss repeated every time.
>
> A prompt is advice. A gate is policy.
>
> It was also cheaper: about 23% fewer tokens per question, one tool call instead of three.
>
> Also in the write-up: the baseline caught a flaw in my own gate (it was over-blocking), and how I fixed it.
>
> [link to case study]
