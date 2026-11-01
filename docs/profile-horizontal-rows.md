# Profile weekday chart layout

User reference: the Average sales by weekday chart, not the pay donut.
The previous bars already extended horizontally, but each label/amount appeared
above its bar. Match the compact Analytics comparison pattern: label on the left,
horizontal plot in the middle, value/count on the right.

The shared Analytics chart module owns the new reusable HorizontalBarRows
presentation. Existing Recorded sales by night and other Profile bar charts
already use HorizontalBarChart and remain unchanged. Donuts are untouched.
No API calls, caching, selected periods, weekday/date formatting, average
calculation, sample counts or best-day ranking change.

The signed zero baseline stays aligned; no-data and real zero remain different
text values, both with zero-width bars. Noninteractive rows do not add tab stops.
Small widths retain the same three-column layout, wrapping text without clipping.

Verification: unit/SSR CSS regression plus EN/JA 320px/1280px browser geometry,
negative/zero/no-data/tied values, keyboard period selection, unchanged request
counts and long labels. Internal synthetic screenshots are not deliverables.
