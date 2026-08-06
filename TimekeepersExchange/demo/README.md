# Hosted demo build

`index.html` is the output of `cd ../web && npm run build:artifact` — the whole
app in one self-contained file (CSS, JS and fonts inlined, no external requests).

It is committed so it can be served directly from the public repo without a
deploy pipeline, for quick sharing:

https://raw.githack.com/Brooklyn20i/rodney-brain/claude/timekeepers-exchange-build-aumepb/TimekeepersExchange/demo/index.html

Regenerate after any source change — this file does not update itself.
