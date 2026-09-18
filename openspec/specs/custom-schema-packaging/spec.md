## Purpose

Define packaging and documentation conventions for reusable, project-local OpenSpec schemas.
## Requirements
### Requirement: Repository SHALL package each custom schema in a self-contained folder
The repository SHALL organize custom OpenSpec schemas as one folder per schema, where each folder contains all files required for a user or coding agent to install that schema into a target project, and SHALL only retain schema folders that are backed by an OpenSpec change history and canonical spec coverage.

#### Scenario: Installable schema folder exists
- **WHEN** a user selects a schema from this repository
- **THEN** that schema is available as a single folder that can be copied into `openspec/schemas/<schema-name>/` in the target project

#### Scenario: Unproposed schema packages are removed before rebuild
- **GIVEN** a schema folder exists under `openspec/schemas/`
- **AND** the schema lacks proposal-backed canonical spec coverage under `openspec/specs/`
- **WHEN** maintainers decide to rebuild that schema through OpenSpec proposals
- **THEN** the unproposed schema folder is removed before the proposal-backed replacement is added
- **AND** repository catalog documentation no longer advertises that schema until the replacement is archived.

### Requirement: Each schema SHALL declare companion skills in a manifest
Each schema folder SHALL contain a `skills.txt` manifest listing its companion skills, one skill name per line and nothing else, where every listed name exactly matches a directory under `.agents/skills/` in https://github.com/intent-driven-dev/skills. Because the manifest lives inside the schema folder, copying the schema carries the manifest into the target project.

Affected schemas:
- `behaviour-driven` (`openspec/schemas/behaviour-driven/`)
- `intent-driven` (`openspec/schemas/intent-driven/`)

#### Scenario: All packaged schemas declare their skills
- **WHEN** a user inspects any schema folder under `openspec/schemas/`
- **THEN** it contains a `skills.txt` manifest:
  - `minimalist`: `openspec-git-discipline`
  - `behaviour-driven`: `acceptance-test-authoring`, `gherkin-authoring`, `glossary`, `openspec-git-discipline`, `spec-as-source`
  - `intent-driven`: `acceptance-test-authoring`, `architectural-decision-records`, `c4-diagrams`, `gherkin-authoring`, `glossary`, `grill-me`, `openspec-git-discipline`, `spec-as-source`
  - `spec-driven-with-adr`: `architectural-decision-records`, `openspec-git-discipline`
  - `event-driven`: `c4-diagrams`, `glossary`, `openspec-git-discipline`

#### Scenario: Manifest names resolve in the canonical skills repository
- **WHEN** the skills repository is freshly cloned
- **THEN** every name in every `skills.txt` exactly matches a directory under `.agents/skills/` in that clone

#### Scenario: Retired skills are not listed
- **WHEN** a user inspects any `skills.txt` under `openspec/schemas/`
- **THEN** no manifest lists `bdd-zone-check`
- **AND** the schemas that previously listed it list `spec-as-source` instead.

### Requirement: Schema READMEs SHALL document associated skills
Each schema README SHALL include an "Associated Skills" section listing exactly the skills from that schema's `skills.txt` with a one-line purpose each, linking to https://github.com/intent-driven-dev/skills, and noting that the skills are installed automatically by the install guide's skills step into `.agents/skills/`. The `spec-driven-with-adr` README SHALL point ADR skill references at the canonical skills repository rather than the retired `intent-driven-template` location and SHALL NOT list schema/skill packaging as pending.

#### Scenario: Reader learns a schema's companion skills from its README
- **WHEN** a user reads the "Associated Skills" section of a schema README
- **THEN** it lists exactly the skills from that schema's `skills.txt`, each with a one-line purpose
- **AND** it links to https://github.com/intent-driven-dev/skills
- **AND** it notes automatic installation into `.agents/skills/` via the install guide

#### Scenario: spec-driven-with-adr README points at the canonical skills repo
- **WHEN** a user follows the ADR skills reference in `openspec/schemas/spec-driven-with-adr/README.md`
- **THEN** it points to https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/architectural-decision-records
- **AND** the README no longer lists "Package schema and associated skills together" as pending

### Requirement: Each schema SHALL include usage and activation guidance
Each custom schema folder SHALL include documentation that explains intended use, unsuitable use cases, and activation steps through `openspec/config.yaml`.

#### Scenario: Coding agent activates schema from schema README
- **WHEN** a coding agent reads a schema folder README
- **THEN** it can determine whether the schema fits and can instruct the user to set `schema: <schema-name>` in `openspec/config.yaml`

### Requirement: Repository root SHALL provide catalog and install guidance for humans and agents
The repository root SHALL include a concise `README.md` for users choosing and installing a published schema. It SHALL explain the collection's purpose, provide one Nub-first public install path, point coding agents to `AGENT_INSTALL.md` for complete installation, and link contributor and schema-specific documentation instead of repeating their procedures.

The root `README.md` SHALL include a schema comparison table before installation guidance. The table SHALL cover the upstream `spec-driven` built-in and every packaged schema with canonical spec coverage. Each packaged schema name SHALL link directly to its local `openspec/schemas/<schema-name>/README.md`, and every row SHALL provide artifact flow and choose-when guidance.

The comparison SHALL position `spec-driven` as the default for most projects and `intent-driven` as the most complete general-purpose schema for complex projects. It SHALL document that `intent-driven` adds a durable ADR artifact to `behaviour-driven` and subsumes `spec-driven-with-adr`; `behaviour-driven` remains the choice when durable ADRs are not needed; `event-driven` targets event-centric or AsyncAPI-first systems; and `minimalist` targets small, low-risk changes. Executable acceptance testing and fenced-Gherkin authoring SHALL be attributed to the optional `spec-as-source` companion skill, not to a schema.

The root install guidance SHALL state that schema packages declare companion skills in `skills.txt`. Detailed prerequisites, fallback copying, activation, validation, skill installation, adapter installation, collision handling, and maintainer CLI commands SHALL remain in their owning agent, schema, or contributor documentation.

#### Scenario: Human discovers schema options from repo root
- **WHEN** a human user opens the repository root `README.md`
- **THEN** they can compare the built-in schema and every packaged schema by artifact flow and intended use
- **AND** each packaged schema name links to its local schema README

#### Scenario: Agent reaches complete installation guidance from repo root
- **WHEN** a coding agent opens the repository root `README.md`
- **THEN** it can find a prompt that points to the raw `AGENT_INSTALL.md`
- **AND** the local `AGENT_INSTALL.md` link identifies the complete installation guide

#### Scenario: Human discovers the intent-driven schema from the root catalog
- **WHEN** a human user opens the repository root `README.md`
- **THEN** they can find `intent-driven` in the schema catalog
- **AND** they can find a reference to `openspec/schemas/intent-driven/README.md`.

#### Scenario: Root catalog excludes removed linearized schema
- **GIVEN** the `linearized` schema package has been removed from `openspec/schemas/linearized/`
- **WHEN** a human or coding agent reads the root `README.md`
- **THEN** the schema catalog no longer lists `linearized` as an available schema
- **AND** the README no longer points readers to `openspec/schemas/linearized/README.md`
- **AND** install examples no longer tell agents to activate `schema: linearized`

#### Scenario: Reader learns about associated skills from the root README
- **WHEN** a human or coding agent reads the "Install a Schema" section of the root `README.md`
- **THEN** they learn that each schema declares companion skills in a `skills.txt` manifest
- **AND** they can follow the agent install guide or schema README for skill details

#### Scenario: Reader can choose a schema from the root README
- **WHEN** a human or coding agent reads the "Choosing a Schema" section of the root `README.md`
- **THEN** they learn that `spec-driven` is the upstream default suitable for most projects
- **AND** they learn that `intent-driven` is the most complete general-purpose schema for complex projects
- **AND** they can compare `spec-driven` and all packaged schemas in a table showing each schema's artifact flow and choose-when guidance

#### Scenario: Reader learns accurate inter-schema relationships
- **WHEN** a human or coding agent reads the "Choosing a Schema" section of the root `README.md`
- **THEN** they learn that `intent-driven` is `behaviour-driven` plus a durable ADR artifact, sharing the same OpenSpec Markdown delta spec format
- **AND** they learn that `intent-driven` still subsumes `spec-driven-with-adr` and that `behaviour-driven` remains the choice when durable ADRs are not needed
- **AND** they learn that `event-driven` targets event-centric/AsyncAPI-first systems and `minimalist` targets small, low-risk changes

#### Scenario: Acceptance testing is attributed to the companion skill
- **WHEN** a human or coding agent reads the root schema comparison
- **THEN** executable acceptance testing and fenced-Gherkin authoring are described as provided by the `spec-as-source` companion skill
- **AND** no schema is described as running an acceptance suite
- **AND** the root guidance does not name a `stack:` key as part of activation.

#### Scenario: Human has one published install path
- **WHEN** a human user reads the root install section
- **THEN** they find one Nub-first command that installs and activates a selected published schema
- **AND** detailed variants and fallback procedures are linked rather than repeated

#### Scenario: Catalog links disclose schema detail
- **WHEN** a human or coding agent reads the schema catalog in the root `README.md`
- **THEN** every packaged schema, including `spec-driven-with-adr`, appears in one comparison table
- **AND** every packaged schema links to its README for fit, activation, artifact, and skill detail

#### Scenario: Post-apply validation still passes
- **WHEN** the root `README.md` update is applied
- **THEN** `openspec schema validate` continues to pass for every packaged schema as a sanity check

### Requirement: Repository SHALL document change-local schema selection
The repository SHALL distinguish the project default in `openspec/config.yaml` from the schema pinned by an existing change in its `.openspec.yaml`. Root guidance SHALL stay concise and link to `AGENT_INSTALL.md` for the complete `set-change-schema <change> <schema> [-t|--target <project>] [--apply] [--allow-incompatible]` workflow, while `CONTRIBUTING.md` SHALL document the local maintainer command.

#### Scenario: User previews a schema change before mutation
- **GIVEN** an incomplete change pins a schema in its `.openspec.yaml`
- **WHEN** the user runs `set-change-schema <change> <schema>` without `--apply`
- **THEN** the command reports compatibility and the planned mutation
- **AND** it does not mutate any file

#### Scenario: User applies a compatible schema change
- **GIVEN** the destination schema is already installed
- **WHEN** the user runs `set-change-schema <change> <schema> --apply`
- **THEN** only the selected change's `.openspec.yaml` is updated
- **AND** `openspec/config.yaml`, installed schemas, and artifact files remain unchanged
- **AND** no artifact is migrated automatically

#### Scenario: User accepts an incompatible artifact graph
- **GIVEN** the source and destination schemas have different artifact graphs
- **WHEN** the user applies the schema change
- **THEN** the command requires explicit `--allow-incompatible`
- **AND** the user remains responsible for reconciling existing artifacts with the destination schema

#### Scenario: Completed change keeps its historical schema
- **GIVEN** a change is complete
- **WHEN** the user wants subsequent work to use another schema
- **THEN** the completed change remains unchanged under its pinned schema
- **AND** the user creates a new change under the new schema

### Requirement: Schema changes SHALL be validated with OpenSpec CLI
Any new schema or schema modification in this repository SHALL be verified by running `openspec schema validate <schema-name>` before considering the change complete.

#### Scenario: Schema passes structural validation
- **WHEN** a contributor finishes creating or editing a schema
- **THEN** they run `openspec schema validate <schema-name>` and confirm the command reports successful validation
