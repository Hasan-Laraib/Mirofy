# Regression fixtures

Documents that reproduced a specific defect, frozen at the shape that
reproduced it.

These are copies, not references. Each began as a benchmark corpus document,
and a test that reads the corpus directly would go quiet the day the corpus is
re-captured with a model that happens to write something easier — which is the
one thing a regression test must not do.

Reducing them does not work either, and that is worth recording: a hand-trimmed
version of `boundary-border-run` rendered clean on the very code it was meant to
catch. The trigger depended on the sublabels (which set the fitted node widths,
and so the positions) and on the authored `fromSide`/`toSide` (which constrain
what the router may choose). A smaller fixture is a fixture that proves less.

| fixture | reproduced |
|---|---|
| `boundary-border-run.architecture.json` | the router picking a corridor that lay along a boundary's edge — 3 × `composition/container-border-run` |
| `unchecked-cross-lane.workflow.json` | the cross-lane fallback returned with no side or clearance test — 6 × `endpoint-side-direction`, 3 × `edge-through-node` |
