# Planted issues in the sample data

The sample data is fictional and generated with a fixed seed (`npm run data`).
"Now" is fixed at **Thursday 22 October 2026, 10:00 IST**. These problems are planted on purpose:

| # | Problem | Where | Why it matters |
|---|---|---|---|
| 1 | **Silent coverage gap** | South, 19 Oct: no rows, but the load is marked complete | A sum over this period quietly under-reports |
| 2 | **Partial day** | 21 Oct, store channel: load still pending | "Yesterday" looks normal but is missing store sales; online is fine |
| 3 | **Failed quality check** | West, 14 Oct: returns doubled (duplicate return events) | Net revenue for any scope that includes it is wrong. Gross sales, orders and AOV don't use returns, so they are unaffected |
| 4 | **Day in progress** | 22 Oct (today) | Not loaded yet; any period including today is incomplete |
| 5 | **Draft metric** | Contribution margin is uncertified | No approved definition exists |
| 6 | **Access rules** | Finance net revenue: finance, analyst, executive only. Guest: no metrics | The answer must not leak to the wrong role |
| 7 | **Ambiguous terms** | "revenue", "net revenue" → Finance or Sales definition; "sales" → gross or net sales | The definitions differ by about 15% |

Data covers 1 September – 21 October 2026, four regions (North, South, East, West) and two channels (online, store).
