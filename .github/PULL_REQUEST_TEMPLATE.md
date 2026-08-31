## What changed, and why

<!-- The why matters more than the what -- the diff already says what. -->

## How you know it works

<!--
Not "tests pass". Which test, and would it have failed before?

The house habit is to plant the opposite of your claim and watch the test die.
A test that passes with the fix reverted is not testing the fix, and this
project has shipped several of those before noticing.
-->

- [ ] `npm run check` passes locally
- [ ] The new behaviour has a test that **fails without the change**
- [ ] `CHANGELOG.md` has an entry, or this genuinely needs none and says so

## Anything you are unsure about

<!--
Say it here rather than leaving it to be found. "I could not work out how to
test the Windows path" is a useful sentence and costs you nothing.
-->
