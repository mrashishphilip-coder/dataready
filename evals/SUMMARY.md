# DataReady experiment: summary across runs

Question set v2. Each arm answered all 41 labeled questions. AI arms are run 3 times because model output varies between runs; the table shows the mean and, in brackets, the lowest and highest count. The rules arm is deterministic, so one run is enough.

| Arm | Model | Runs | Correct | False approvals | Wrong numbers | Unnecessary blocks | Clarify↔decline mix-ups | Errors | Tokens per question (in / out) |
|---|---|---|---|---|---|---|---|---|---|
| DataReady · rules interpreter | none | 1 | 37 | 0 | 4 | 0 | 0 | 0 | 0 / 0 |
| DataReady · AI interpreter | openai · gpt-5.5 | 3 | 41 | 0 | 0 | 0 | 0 | 0 | 791 / 77 |
| AI agent, no gate (baseline) | openai · gpt-5.5 | 3 | 39.7 (39–40) | 1 | 0 | 0 | 0.3 (0–1) | 0 | 2607 / 290 |
| AI agent + DataReady gate | openai · gpt-5.5 | 3 | 41 | 0 | 0 | 0 | 0 | 0 | 1210 / 134 |

- **False approval:** reported a number when it should have asked or declined. The dangerous error.
- **Wrong number:** answered when it should have, but with the wrong metric or value.
- **Unnecessary block:** asked or declined when a clean answer existed. The annoying error.

## Every question missed at least once

| Arm | Question | Expected | Verdict in each run | What it tests |
|---|---|---|---|---|
| DataReady · rules interpreter | **A05** What was our average order value in East from October 1 to October 7? | answer | wrong_number | ratio metric, explicit range |
| DataReady · rules interpreter | **A11** Number of orders in North stores from Oct 15 to Oct 20 | answer | wrong_number | region and channel scope |
| DataReady · rules interpreter | **A14** What did Sales net revenue look like for East and North between 12 and 18 October? | answer | wrong_number | two regions, quality failure out of scope |
| DataReady · rules interpreter | **A17** What were gross sales for West in the week of 5 October? | answer | wrong_number | paraphrased period |
| AI agent, no gate (baseline) | **C09** What was revenue in Q3? | clarify | correct, safe_mismatch, correct | ambiguous metric |
| AI agent, no gate (baseline) | **B10** Online GMV for the last 7 days | decline | false_approval, false_approval, false_approval | South gap on 19 Oct affects online too |
