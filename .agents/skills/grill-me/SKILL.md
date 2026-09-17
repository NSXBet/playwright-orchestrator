---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when the user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
metadata:
  internal: true
---

# Grill Me

Interview the user relentlessly about every aspect of the plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one.

For each question:

1. Ask a single sharp question.
2. Explain why that question matters if it is not obvious.
3. Provide your recommended answer.
4. Use the user's response to decide the next most important unresolved branch.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.

Keep going until:

- The major design decisions are resolved.
- Key risks, trade-offs, and assumptions are explicit.
- The next implementation step is clear.

At the end, summarize:

- Final decisions
- Open questions
- Recommended next step
