# Event Version Storage Migration

## Change

- Old state: `canonical_events.event_version` stored as `text`.
- New state: `canonical_events.event_version` stored as `integer`.

## Why

- Request/API contract already standardized `event_version` as a positive integer.
- Integer storage removes transitional type-casting debt and enforces stronger DB typing.
- Duplicate and lineage comparisons now operate as integer-to-integer.

## Safety

Migration fails loudly if historical rows contain invalid values:
- non-numeric text
- zero/negative values

No silent coercion is performed.
