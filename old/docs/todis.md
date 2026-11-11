# TODIS — Practical Summary for LLMs Working with the Author

## What This Document Is

TODIS (The Organization of Digital Information Systems) is a treatise by Federico Pereiro laying out a philosophy and practical framework for designing, building, and understanding digital systems. The author's central claim is that this approach can yield ~10x improvements in development speed and significant quality gains. He is actively testing this via [cell](https://github.com/altocodenl/cell).

---

## The One Rule

**Always focus on the data.** Not on languages, frameworks, paradigms, type systems, protocols, architectures, or performance. Those are tools (the author calls them "The List"). The data — how it is communicated, stored, and transformed — is the entire game. If you're helping the author, look at the data first and foremost.

---

## The Five Pillars (Core Framework)

### Pillar 1: Single Representation of Data — "fourdata"

All data is represented using only **four types**:

1. **Number** — `1234`
2. **Text** — `hello` or `"hello world"` (quotes for multi-word or special chars)
3. **List** — ordered by numeric keys (1, 2, 3… or dashes `-`)
4. **Hash** — keyed by texts, alphabetically ordered

Nesting is shown via indentation. This representation is used for *everything*: HTTP requests, database rows, file contents, CPU registers, HTML, etc.

**Key rule:** There are no empty containers. Every line ends in a text or number value.

### Pillar 2: Single Dataspace

All data lives in one unified space, organized by **paths** — sequences of texts and numbers that both locate and describe the data.

- Context grows to the **left**, detail grows to the **right**.
- Paths *are* the data — no metadata needed. The structure is self-describing.
- Files, databases (SQL, MongoDB, Redis), and all other storage map into this single dataspace.
- No "floating" data — everything has a path/place.

### Pillar 3: Call and Response

All computation (communication + transformation) is expressed as **a call and its response**:

```
@ destination message
= response
```

- `@` marks a call.
- `=` marks the response/result.
- This model covers: variable references, function calls, HTTP requests, DB queries, OS syscalls, assembly instructions — all levels.
- Calls are embedded in the dataspace at a specific location. They don't float.
- Pending calls show `= PENDING...`. Errors are also valid responses (`= error "reason"`).
- Calls are **fractal/self-similar**: a response is itself made of further calls.
- No distinction between "internal" and "external" calls from a structural standpoint.

### Pillar 4: Logic (What Happens Between Call and Response)

Logic has **five elements** (the author calls them "fivelogic"):

1. **Reference** — `@ destination` — points to another part of the dataspace. Resolved by walking up (left) through enclosing scopes.
2. **Sequence** — a list of calls executed in order. Defined with `:`. The response to the *last* call becomes the response of the whole sequence.
3. **Conditional** — `@ if cond ... do ... else ...` — chooses which sequence to expand. `res` can break out of a sequence early.
4. **Loop** — `@ loop data ... do ...` — iterates over lists/hashes. Supports `filter`, `times`, `acc` (accumulator), and conditions to stop early. Recursive calls handle nested/deep iteration.
5. **Error** — `stop do ... then ...` — stops a sequence at the first error and handles it. Prevents cascading failures.

The first three (reference, sequence, conditional) are essential and irreducible. Loops and errors are extremely useful but built on top of the first three.

**Key insight:** The expansion of a sequence (`:`) *is* the computation. It shows every intermediate call and response. This replaces logs and debuggers conceptually.

### Pillar 5: Interface Is Call and Response

- Every call has an **interface** (the call + response visible from outside) and **logic** (the internal sequence of sub-calls).
- User interactions and system calls are structurally identical — no special boundary between user and system.
- **Reactivity**: when data changes, all dependent calls are automatically re-evaluated (like a spreadsheet). This keeps the system in sync across time.
- **Self-similarity**: the same call-and-response pattern applies at every level, from UI clicks to CPU instructions.

---

## Practical Guidance the Author Gives

### For Understanding Existing Systems
- Dump all databases → convert to fourdata → single dataspace.
- Capture and analyze logs as data in the dataspace.
- Write data constraints (type, equality, range, pattern matching covers 90-99%).
- Use the real system, not unit tests, to understand behavior.
- Go 80/20: a few core calls represent most value/mystery.
- Feed unified data to LLMs to find patterns.
- Refactoring = changing logic without changing the interface of a call.

### For Designing & Implementing New Systems
- Design data at rest first (the dataspace).
- Design call interfaces with concrete examples (call → response).
- Tackle the hardest calls early to surface algorithmic issues.
- Strictly validate all inputs to every call.

### For Running Systems
- Treat expansions (logs) as first-class data in a queryable dataspace.
- Obscure private data in expansions.
- Have clear deletion/retention policies, enforced in logic.

### For Testing
- Tests = enumerations of calls and expected responses (interface specs).
- Test against each call. Full equality checks on call and response.
- Validation order in a call should be linear, stopping at first error (jidoka).
- Tests ordered to mirror validation order in the implementation.
- Aim to cover each family of cases, converging on a finite proof of correctness.

### For Security
- Users and permissions are data in the dataspace.
- Zero trust: every non-public call checks identity and authorization.
- Wrap calls with a single auth-checking call.
- Don't rely on obscurity (Kerckhoffs's principle).

### For Scaling
- Consistency issues arise from parallel writes to shared data.
- Author prefers **consistency over performance** (easier to reason about).
- Consistent = process related calls one at a time (queues, locks, transactions).
- Performance-first = let parallel calls happen, detect and fix inconsistencies after.

### System Qualities to Aim For ("Bounciness")
- **Reversibility**: mistakes can be immediately reverted with a single call.
- **Idempotence**: creating something already created, or deleting something already gone, doesn't error.
- **Transactionality**: nothing left half-done on error; safe to retry.

### The Two Speeds
- **Speed of movement**: how quickly can the system be adapted?
- **Speed of fire**: how fast does the system execute?
- The author argues these two metrics capture nearly everything desirable about a system (simplicity enables the first; quality enables the second).

---

## The Five-Headed Beast (System Parts)

1. **Databases & file systems** — permanent storage
2. **Backend** — controls data flow to/from storage
3. **Frontend** — interacts with user device and backend
4. **Tests** — portable, executable specification (kept separate)
5. **Logs & alerts** — operational data for maintainers

---

## Key Terminology Quick Reference

| Term | Meaning |
|------|---------|
| fourdata | The 4-type data representation (number, text, list, hash) |
| dataspace | The single unified space where all data lives |
| path | Sequence of keys locating any value in the dataspace |
| `@` | Marks a call |
| `=` | Marks a response/result |
| `:` | Defines a sequence (frozen calls) or shows an expansion |
| fivelogic | The 5 elements of logic: reference, sequence, conditional, loop, error |
| expansion | The full trace of sub-calls within a call — the computation made visible |
| The List | Tools (languages, frameworks, etc.) that distract from data |
| cell | The author's project to implement this as an executable language |
