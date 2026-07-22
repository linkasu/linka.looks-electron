# Connection sets test plan / QA checklist

## Minimal automated regression tests

- [ ] Normalize an old `match` page with `columns`; both row counts resolve to `columns` and cards remain unchanged.
- [ ] Normalize unequal top/bottom counts; row lanes and total capacity are correct.
- [ ] Increasing capacity adds placeholders; decreasing capacity preserves existing cards and flags overflow.
- [ ] Pairwise linking assigns one group ID and merges two existing groups without changing card IDs.
- [ ] A group with `T` top and `B` bottom cards reports `T × B` intended pairs.
- [ ] A correct pair is counted once; repeating it is ignored.
- [ ] Cards become complete only after all of their intended pairs are solved.
- [ ] Same-row, missing-group, one-row-only, and overflow cases are invalid for gameplay.
- [ ] Existing two-card match tests continue to pass.

## Manual editor QA

- [ ] Open an existing equal-row match set; verify it looks and behaves as before.
- [ ] Create a match page and set different top and bottom counts.
- [ ] Increase either count; verify new placeholder cards appear.
- [ ] Decrease a count with populated cards; verify no card, ID, or matchId is silently deleted and the draft is marked invalid.
- [ ] Remove/reconfigure overflow cards and verify the invalid marker clears when capacity is valid.
- [ ] Drag cards within a row and across the row boundary; verify order, IDs, and matchIds persist and invalid groups are marked.
- [ ] Link one top card to multiple bottom cards by repeating pairwise linking.
- [ ] Link multiple top cards to one bottom card.
- [ ] Link two existing groups and verify all members receive one merged group ID.
- [ ] Clear a group and verify every member becomes unlinked and invalid.
- [ ] Verify non-audio cells are ignored and do not receive playable-link requirements.
- [ ] Verify full editor directions explain repeated linking, group merging, and invalid markers.
- [ ] Save an incomplete draft successfully.

## Manual gameplay QA

- [ ] Open a valid two-card legacy match set and solve its one pair.
- [ ] Open a valid unequal-row set with a 2×3 group; solve all six cross-row combinations.
- [ ] Verify an already solved pair cannot increase progress or errors.
- [ ] Verify each card remains selectable until all of its intended pairs are solved, then becomes marked/disabled.
- [ ] Verify the page completes only after every intended pair in every group is solved.
- [ ] Try an incorrect pair; verify normal incorrect-match behavior remains intact.
- [ ] Verify the short gameplay hint explains that every top-to-bottom combination is required.
- [ ] Open an invalid draft; verify gameplay silently refuses to start.
- [ ] Verify non-audio cells are ignored during valid gameplay.
- [ ] Restart the page/game and verify pair progress resets.

## Compatibility and regression

- [ ] Load old `.linka` files without new row-count fields.
- [ ] Save and reload a new unequal-row page; verify optional fields round-trip.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run typecheck`.
- [ ] Run the relevant lint command for changed files.
