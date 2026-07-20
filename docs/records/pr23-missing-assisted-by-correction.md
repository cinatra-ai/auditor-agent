# Correction: missing Assisted-by trailer on b59c56d3 (PR #23)

**Corrected commit:** `b59c56d397d5be7c59182eead8827c1eefa31ab9` — squash merge of
PR #23 ("chore(deps): update actions/checkout action to v7", a Renovate dependency
bump), merged 2026-07-20 during the weekly Renovate window.

**What went wrong:** the merge tooling passed the squash body under a wrong REST
field name, so the body was silently dropped. The commit carries only the subject
plus GitHub's automatic `Co-authored-by: renovate[bot]` line, and is MISSING the
mandatory attribution record.

**The true record for b59c56d3:** `Assisted-by: none` — a bot dependency bump whose
diff no AI agent materially changed. (The `Co-authored-by: renovate[bot]` line is
GitHub's standard PR-author attribution of a non-AI bot, not an AI co-authorship
line.)

**Lesson:** squash bodies go through `commit_message` on the REST merge call and are
verified present in the merged commit; the sweep tooling was fixed before the very
next merge (PR #35 carries the trailer correctly).
