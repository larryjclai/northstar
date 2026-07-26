# Plan 277: Land the GA-motion spike doc in main, retire its branch

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW (docs-only; no source file changes)
- **Depends on**: nothing
- **Category**: docs / repo hygiene
- **Planned at**: commit `fcc7f4fd`, 2026-07-26

## The problem

`docs/motion-ga-spike.md` (336 lines, plan 161's spike, committed 2026-07-12 as
`46b00892`) exists **only** on the unmerged branch `feat/ai-ga-motion-spike`.
`plans/README.md` records this deliberately in two places (`:570`, `:647-648`
— _"its `docs/motion-ga-spike.md` lives only on that branch"_), so this is a
tracked decision, not neglect.

But the decision has a cost that has now come due:

1. **Nobody reads it.** It is not in `main`, so it is invisible to every
   normal path — `docs/`, grep, the doc map in `AGENTS.md`.
2. **It is one `git branch -D` away from gone.** During this session's branch
   cleanup it was very nearly deleted on the mistaken belief that its contents
   were already in `main`. The next cleanup may not catch it.
3. Its findings are still live and unclaimed — including **a real bug in the
   original plan's assumptions**: `prefers-reduced-motion` does **not** cover
   view-transition pseudo-elements, so any real implementation must add its own
   override (Part A §4).

The branch was kept unmerged because of the **code** on it, not the doc. The
PoC in `router.tsx`/`globals.css` is labelled, in its own source comments,
_"Throwaway PoC, remove before/instead of merging"_, and the doc's own
follow-up #1 says to delete it before the real ticket. That reasoning was
always about the code. It never applied to the doc.

## What to do

Land the doc, drop the code, keep the code **retrievable**, and fix the index.

### Step 1 — preserve the PoC commit before anything else

Deleting a branch makes its tip unreachable, and unreachable commits are
eventually garbage-collected. The doc's Part A §3 is titled _"Wired PoC (real,
compiling, on this branch)"_ and describes that code in detail, so the code
must stay fetchable or §3 becomes a dangling reference.

```bash
git tag spike/161-ga-motion-poc feat/ai-ga-motion-spike
git push origin spike/161-ga-motion-poc
```

**STOP** if the tag already exists pointing somewhere else.

### Step 2 — bring the doc onto main, docs-only

```bash
git checkout main
git checkout feat/ai-ga-motion-spike -- docs/motion-ga-spike.md
```

`git status` must show **exactly one** added file. If `router.tsx` or
`globals.css` appear, you used the wrong command — **STOP**.

### Step 3 — repair the doc's now-dangling self-references

The doc was written from the branch's point of view. On `main` two things are
no longer true as written: the PoC is not in the working tree, and "this
branch" no longer exists.

Add a short note directly under the H1 (do not restructure the doc, do not
rewrite the verdicts — they are the deliverable and they are still valid):

```markdown
> **Status (2026-07-26)**: this spike's findings are live and unclaimed; the
> verdicts below stand. The **PoC code it describes is NOT in `main`** — it was
> throwaway by design (see Part A §3 and follow-up #1). It is preserved at tag
> `spike/161-ga-motion-poc` (commit `46b00892`); retrieve it with
> `git show spike/161-ga-motion-poc -- src/routes/router.tsx src/styles/globals.css`.
> The branch it lived on, `feat/ai-ga-motion-spike`, has been deleted.
```

Then fix Part A §3's heading, which currently reads _"Wired PoC (real,
compiling, on this branch)"_ — change "on this branch" to "at tag
`spike/161-ga-motion-poc`". Grep the whole doc for any other "this branch"
phrasing and fix each the same way.

### Step 4 — fix the index, or this becomes the next stale record

`plans/README.md` states in two places that the doc lives only on that branch.
Both become false the moment Step 2 lands. Update both (`:570` area and
`:647-648` area) to say the doc is now in `main` and the PoC is at the tag.
Do not delete the historical entries — amend them, matching the file's existing
correction style (this repo's index has repeatedly bitten us with stale rows;
plan 263's "尚未 merge" was corrected earlier today for exactly this reason).

Add a row for 277 itself.

### Step 5 — retire the branch

Only after Steps 1–4 are committed:

```bash
git branch -D feat/ai-ga-motion-spike
```

`-D` (not `-d`) is required and correct here: the branch is genuinely
unmerged, and that is intentional — its code is deliberately not going into
`main`. The tag from Step 1 is what makes this safe.

## Explicitly out of scope

- Implementing **any** of the four follow-ups. This plan lands a document; it
  does not act on it. Follow-ups #1 (View Transitions ticket) and #3
  (scroll-edge on the demo banner + analytics nav) are real, scoped, and
  unblocked — they deserve their own plans, cut from the doc once it is in
  `main`.
- Touching `router.tsx`, `globals.css`, or any source file. **Zero** source
  changes.
- Rewriting the spike's analysis or verdicts.

## Verify

1. `git diff --stat main@{1}` (or the pre-change ref) lists **only**
   `docs/motion-ga-spike.md` and `plans/README.md`. Any source file ⇒ STOP.
2. `git show spike/161-ga-motion-poc:src/routes/router.tsx | grep -c "data-vt"`
   → non-zero. The PoC is retrievable after the branch is gone.
3. `grep -c "this branch" docs/motion-ga-spike.md` → `0`.
4. ~~`grep -rn "lives only on that branch\|lives ONLY on that branch" plans/README.md`
   → prints nothing.~~ **Criterion was wrong — it contradicted this plan's own Step 4**,
   which says to _amend_ the historical entries rather than delete them, so the phrase must
   still appear. Corrected assertion: both occurrences still match, **and each is now
   followed by a `plan 277` correction annotation** — i.e. the counts from
   `grep -c "lives only on that branch\|lives ONLY on that branch" plans/README.md` and
   `grep -c "由 plan 277\|過時(2026-07-26,plan 277)" plans/README.md` are **equal (2 and 2)**.
5. `npm run format:check` passes (Prettier formats Markdown in this repo).
6. `npm test` → 1512 passing, unchanged. (Docs-only; this is a regression
   guard, not a real risk.)

## Commit

`docs(motion): land the plan-161 GA-motion spike in main (plan 277)` +
standard trailer.

## Maintenance notes

- The general lesson, worth more than this one doc: **a spike's findings and a
  spike's throwaway code have different lifetimes.** Keeping both on an
  unmerged branch to protect the code strands the findings, which are the part
  with lasting value. Land the doc, tag the code.
- Follow-ups #1 and #3 are the ones worth cutting plans for. #2 needs real
  hardware (macOS Sequoia+ / iOS 18+) and should ride along with the iOS build
  work. #4 (Dynamic Type) is correctly deferred past GA — the doc's evidence
  for that (two independent fixed-px type systems + 102 scattered literal
  `fontSize:` values + `-webkit-text-size-adjust: 100%`) is strong; do not
  re-litigate it without new information.
