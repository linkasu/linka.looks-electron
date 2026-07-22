# Connection sets implementation plan

## Goal

Extend the existing `match` page mode so authors can configure independent top/bottom row sizes, merge pairwise links into many-to-many groups, and require every implied cross-row pair during gameplay without breaking existing match files.

## Data model and normalization

1. Add optional match-page row-count fields, recommended names `topColumns` and `bottomColumns`.
2. Retain `columns` as the legacy/equal-row field. Old match pages normalize `columns` into both new counts; do not bump the set version.
3. Keep one `matchId` per card. A group is the set of cards sharing that ID; every top card in the group connects to every bottom card in it.
4. Recompute `matchLane` from the normalized top-row boundary. Preserve card order, IDs, and matchIds.
5. Treat the configured capacity as `topColumns + bottomColumns`: increasing it adds `NewCard` placeholders; decreasing it never deletes cards. Preserve overflow cards in the draft and mark the page invalid until the author fixes the counts/cards.
6. Allow non-audio cells as ignored/non-playable cells. Every playable audio card still needs a group containing at least one top and one bottom audio card.

## Editor

1. Update page settings to edit independent top and bottom counts for match pages while retaining the existing columns control for legacy/equal pages.
2. Update grid sizing, row-boundary calculations, drag/reorder handling, and placeholder capacity for unequal rows.
3. Keep pairwise linking as the only interaction: selecting a top/bottom pair links them, choosing cards already in different groups merges those groups, and repeated links build arbitrary groups.
4. Keep clearing a selected card's whole group as the removal operation.
5. Validate audio cards and groups; mark invalid cards/groups in the editor. Allow these drafts to save.
6. Add full editor directions explaining row selection, repeated pairwise linking, group merging, and invalid-card markers.

## Gameplay

1. Refuse invalid match pages before interaction, without starting gameplay or adding a new user-facing error flow.
2. Track solved pair keys in transient page state, not in `.linka` files. A pair key is order-independent and contains the two card IDs.
3. For a valid group with `T` top cards and `B` bottom cards, generate `T × B` intended pairs.
4. A correct selection adds that pair once. Repeating a solved pair is ignored and does not inflate progress or errors.
5. Keep each card selectable until all of its intended pairs are solved; then mark/disable it. The page completes when all intended pairs are solved.
6. Preserve existing two-card match behavior as the `1 × 1` case.
7. Replace the current short match message with a concise gameplay hint explaining that every top-to-bottom connection must be found.

## Validation and compatibility

- Keep old equal-row match files loadable and playable unchanged.
- Revalidate groups whenever row counts or card order changes; same-row groups and incomplete groups are invalid.
- Do not silently delete cards or rewrite old files merely because optional fields are absent.
- Follow existing editor and gameplay patterns for invalid markers and silent refusal.

## Suggested implementation order

1. Extend shared types, normalization, row sizing, and capacity handling.
2. Add shared match validation/group helpers and minimal unit regressions.
3. Update editor settings, grid layout, link merging, invalid markers, and directions.
4. Update gameplay pair tracking, card completion, duplicate handling, and hint.
5. Add legacy/unequal-row regression coverage and run the manual QA checklist.
6. Update format documentation if needed and add the release-note entry.

## Acceptance checks

- Existing two-card match files still load and play.
- Unequal rows retain card IDs, order, and links through editing/resizing.
- Pairwise linking can construct and merge arbitrary groups.
- Invalid drafts save and show editor markers but cannot start gameplay.
- Every `T × B` pair is solvable exactly once; completed cards disable independently.
- Capacity increases add placeholders; decreases preserve overflow without silent deletion.
