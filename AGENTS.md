# Carapace - Agent Context

## What This Is

Carapace is in early development. This file defines coding standards and design principles for all AI agents (Claude, Gemini, or otherwise) working in this repository.

## Core Principles

### I. POD Only (Plain Old Data)

All data structures MUST be Plain Old Data. No classes for data containers.

- Input and output are always JSON-serializable POD
- No `class` keyword for data structures
- No inheritance hierarchies for data
- Types are interfaces or type aliases only
- Functions transform POD → POD

**Rationale:** Classes obscure data shape, complicate serialization, and introduce hidden state. POD is transparent, debuggable, and universal.

### II. Result Envelope

Every public function MUST return the same shape:

```typescript
{
  status:  "success" | "error",
  result:  T | null,
  errors:  ErrorMap | null,
  meta:    { path, timestamp, duration_ms }
}
```

- On success: `result` contains data, `errors` is `null`
- On error: `result` is `null`, `errors` mirrors result structure with arrays at leaves
- `meta` is always populated
- No exceptions for control flow; errors are data

**Rationale:** Consistent shape enables tooling, simplifies error handling, and makes APIs predictable. Callers never guess what they'll get back.

### III. Public API is the Boundary

The public interface is a hexagonal port — the boundary between outside and inside.

- Handlers are thin adapters that delegate to internal functions
- Internal code uses normal function calls
- Functional/procedural style internally; KISS over abstraction
- State and I/O adapters live at the edges

**Rationale:** Not everything needs ceremony. Internal code should be simple, direct, and testable without envelope overhead.

### IV. Antagonistic Testing

Tests are specifications. One agent designs, another challenges, then implement.

- Primary agent designs first pass of tests
- Antagonist agent reviews tests, finds blind spots, suggests harder cases
- After antagonist review, tests are LOCKED
- Human checkpoint ONLY when stuck (cannot make tests pass)
- Tests MUST exist before implementation

**Rationale:** Single-agent test design has blind spots. Adversarial review produces robust specifications. Tests define the contract; implementations are disposable.

### V. Unix-Clean

We follow Unix conventions, not JavaScript conventions.

- `null` over `undefined` (explicit absence)
- stdin/stdout/stderr for I/O
- Exit codes matter (0 = success, non-zero = failure)
- Streams and pipes where appropriate
- Simple text protocols (JSON lines, etc.)

**Rationale:** Unix conventions are battle-tested, composable, and universal. JavaScript's `undefined` is an accident of history.

### VI. Simplicity (YAGNI)

Start simple. Add complexity only when proven necessary.

- No premature abstractions
- No "just in case" features
- Three similar lines > one premature abstraction
- If unsure, leave it out
- Complexity MUST be justified in writing

**Rationale:** Over-engineering is the enemy. Every abstraction has a cost. Pay it only when the benefit is clear and present.

## Naming Conventions

| Thing | Style | Example |
|-------|-------|---------|
| Constants | SCREAMING_SNAKE | `MAX_SIZE`, `DEFAULT_TIMEOUT` |
| Types/Interfaces | PascalCase | `FileRecord`, `Concept` |
| Variables/functions | snake_case | `file_path`, `compute_hash` |

Ruby-style snake_case, not JS-style camelCase.

### Terminology

- `params` for input (6 chars)
- `result` for output (6 chars)
- Never use "data" — too generic

## Development Workflow

### The Loop

1. **Design Interface** — Define the public API
2. **Design Tests (Primary Agent)** — Write test cases with input/expected output
3. **Review Tests (Antagonist Agent)** — Adversarial review, incorporate suggestions
4. **Lock Tests** — No changes without human approval
5. **Implement** — Write code (handlers thin, logic functional)
6. **Loop Until Green** — Fix failures, re-run tests
7. **If Stuck → Human Checkpoint** — Only when tests cannot pass

### Error Handling Pattern

Guard early, return errors at top:

```typescript
// Check all required fields first, return immediately on failure
// THEN proceed with logic
```

## Don't

- Use classes for data
- Throw exceptions for control flow
- Return different shapes from public functions
- Skip the Result envelope
- Implement without tests
- Skip antagonist review
- Change tests after review without human approval
- Move to next task with failing tests
- Over-engineer (YAGNI)

## Key Files

- `AGENTS.md` — This file. Coding standards and design principles.
- `dna/` — Company/product knowledge (managed by `/dna.*` commands)
- `dna/product/ROADMAP.md` — Driving task list (when it exists)

## Governance

### Amendment Process

1. Propose change with rationale
2. Document with version bump
3. All PRs MUST verify compliance with these principles
4. Violations require explicit justification and human approval

### Versioning

- **MAJOR**: Principle removed or redefined (breaking)
- **MINOR**: Principle added or materially expanded
- **PATCH**: Clarifications, wording, typos

**Version**: 1.0.0 | **Established**: 2026-02-13
