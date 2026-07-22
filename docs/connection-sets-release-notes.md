# Changelog / release notes

## Connection sets

The existing match card-set type now supports:

- Independently configurable top and bottom row sizes.
- Many-to-many connection groups built through repeated pairwise linking.
- Exhaustive gameplay: every implied top-to-bottom combination must be found.
- Per-card completion markers as all intended connections are solved.
- Draft saving with editor validation for incomplete or invalid groups.

Existing match files remain compatible. The set format version is unchanged; legacy `columns` values continue to define equal row sizes when the new optional row-count fields are absent.

Non-audio cells remain ignored/non-playable. Invalid connection drafts cannot start gameplay.
