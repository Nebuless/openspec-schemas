# Architecture Documents

## Purpose

Durable architecture designs and implementation plans for later review.

## Ownership

`docs/architecture/` owns repository-level design decisions that do not belong
to one OpenSpec change's normative specs or ADRs, including cross-cutting
workflow and adapter boundaries.

## Local Contracts

- Keep plans and architecture designs in this directory.
- Keep ADRs and normative specs in their OpenSpec-owned paths.
- Cite repository paths and external source revisions for material decisions.
- Mark proposed work separately from implemented behavior.
- For workflow or adapter designs, name lifecycle authority, durable state
  owner, allowed mutation paths, handoff boundary, concurrency constraints, and
  verification gate.

## Work Guidance

- Update a design when its decision, phase boundary, or verification contract changes.
- Link implementation work to its governing architecture document.

## Verification

- Run Markdown checks when the repository's quality workflow applies.

## Child DOX Index

No child DOX files.
