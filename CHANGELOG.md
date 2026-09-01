# Changelog

What changed, and why it was worth changing. Newest first.

There are no releases yet, so entries are dated rather than versioned. Each one
records the decision, not only the diff — a line that says *what* a commit did
is already in `git log`, and a changelog that repeats it is a second copy of
something nobody was struggling to find.

`npm run check:changelog` fails when code has changed since the newest entry
here. A running record that anyone can forget to run is a record that quietly
stops being one.

---

## 2026-09-01

### A gate that reddened at random

generate-validators.test.mjs deliberately creates a temp directory inside
packages/core while it runs, and two test files already knew to skip it.
build-skill did not, so whenever the suite happened to run that test while the
bundle was being built, the gate failed on a directory that would be gone a
second later. A check that fails at random is worse than the thing it checks is
good.

### Python

An import adapter for Python, on the same contract as the JavaScript one and
the same rule: never guess.

It resolves relative imports against the importing file's own directory,
absolute imports against the repository root and any directory that actually
holds a package -- which is what a project puts on sys.path, `src/` being the
common case. Resolution is by FILE EXISTENCE: a path is accepted because the
file is there, never because it looked plausible. `from .llm import client`
resolves to the client module rather than the package `__init__.py` beside it,
because that is the edge the code has.

Where it stops, it says so. A computed `importlib.import_module(name)` is a gap
naming its line. A relative import that climbs above the repository root is a
gap. And a specifier that matches two source roots is a gap listing both --
which one wins depends on sys.path, which is configuration and not in the
source, so picking one would be a guess dressed as evidence.

The standard library is named rather than drawn, exactly as node builtins are.
Every Python file imports `os` and `typing`; edges to those would bury the
architecture in the noise the node-builtin rule exists to keep out.

Docstrings are blanked before parsing, with newlines preserved so every later
line number survives. A Python docstring routinely contains example imports,
and reading them would put edges in the diagram that the code does not have,
cited to a line that is prose. Planting "do not strip docstrings" fails.

So does planting "take the first hit when ambiguous", and "treat a computed
import as an ordinary line". A fourth plant -- "draw the stdlib" -- passed,
because the tests only covered the plain `import os` branch and not
`from typing import List`. That branch is covered now.

### The coverage report counted only what it could already read

Someone pointed Mirofy at a Python repository. It produced two boxes from 266
files -- the two JavaScript files in an `examples/` directory -- and reported:

    Of 2 files: 2 analysed, 0 with gaps, 0 not analysed.

Every number true. The impression false, and badly: a reader of coverage.md
alone would conclude the repository was two files and had been fully understood.
On a repository with no JavaScript at all it said `Of 0 files`, printed directly
above its own sentence about how a percentage "silently claims its denominator
is the whole system".

The cause was one line in scan.mjs: the denominator was the union of the
adapters' inventories -- the files an adapter had looked at. `coverageReport`
already partitions correctly and already has a "not analysed -- no adapter
examined these at all" bucket. That bucket could never fill, because a file no
adapter handles was never a candidate. The tool was not failing to read those
files; it was declining to admit they existed.

The denominator is now the repository: every file git is not ignoring, of any
type. The walk and the ignore rules moved to packages/scanner/src/files.mjs so
the scan and the adapters cannot disagree about what "the files" means again.
Mirofy's own report now reads 271 analysed, 8 with gaps, 110 not analysed of 389
-- boring, as it should be, and the .json and .md in that 110 are visibly not a
missing language.

The not-analysed list is grouped by extension before it is named in full. Two
hundred and sixty-four `.py` files listed one per line between the READMEs and
the PNGs is technically complete and practically a way of not saying it.

And `mirofy map` says it out loud, because nobody running a command opens the
report it wrote. When the unread files outnumber the read ones it now names the
proportion, the top extensions, and what Mirofy actually reads. Both exits do
it -- the empty-diagram one most of all, since "nothing to draw" is almost
always "nothing could be read".

This does not add a Python adapter. It stops the tool from quietly overstating
itself on every repository it cannot read, which is a different and more
important thing.

### 0.2.0 crashed on the commonest three-module repository there is

`A imports B`, `A imports C`, `B imports C`. Layered, that is three boxes in one
row, and the A-to-C edge runs straight through B -- so Clean Flow rejected the
diagram and `mirofy map` failed outright. Found by running the PUBLISHED package
against a fresh repository, which is the only place it shows: this repository is
a thirteen-package workspace and never produces that shape.

`skipLevelDetours` is the missing other axis of `sameColumnDetours`. Where an
edge skips a column AND something actually sits in the way, it routes through a
channel below the rows. Where the skipped column is empty the edge stays
straight, because bending an edge that crosses nothing is decoration, and
decoration in a layout engine is a lie about what was in the way. Both halves
are planted.

### The site leads with the product now, not the wordmark

A visitor met a logo, two paragraphs and two buttons. The most attractive thing
the tool makes -- a colourful artifact -- was three screens down, small and grey,
and `mirofy map` was not mentioned anywhere at all.

The hero now carries a real rendered artifact, framed as a window, in whichever
theme the reader's browser asked for. Directly beneath it is the command, with
three lines on what it does: reads your code, models what it found, writes one
file. Both use the site's existing type scale and palette rather than a new one.

The build crashed once on a backtick inside a CSS comment -- that stylesheet
lives inside a JS template literal, and a backtick ends the string. Second time
this file has done that.

### `mirofy map .` -- the README's first sentence, finally true

Pointing Mirofy at somebody else's repository did not work, and failed in the
worst possible way. `scan.mjs` honoured the current directory; `model`,
`compile` and `layout` derived their root from `import.meta.url` -- where the
script file lives. So a scan wrote an evidence graph into the target repository
and every step after it read and wrote inside the MIROFY CHECKOUT, silently
overwriting Mirofy's own scan output and leaving the target with no diagram at
all. All three now resolve the repository from the current directory, with
`--root` to override.

That exposed a second, larger problem. Components came only from
`contains-package` facts, which exist only where a root manifest declares
workspaces. A repository with no workspaces -- which is most of them -- derived
zero components: every import landed as "outside any package" and the diagram
came out empty. The tool working exactly as built, and useless.

`moduleIndex` closes it. Where a repository declares no packages, or exactly
one, components are the source directories, read off dependency facts already
in the graph. Nothing new is scanned and nothing is guessed -- and a module is
labelled `statically-derived`, never `config-derived`, because a directory
inferred from import statements is not configuration. Two or more declared
packages keep package granularity, which is what protects this repository's own
model and all thirty golden digests from the fallback.

And `mirofy map [dir]` runs the five steps in order, because telling a newcomer
to run five commands with a `--from-graph` flag in the middle is telling them
not to bother. An empty result is reported as an empty result, with a pointer
to the coverage report, rather than rendered as a blank page and called a
success.

### The first tarball built with the pipeline could not lay anything out

Installing it and mapping a repository -- rather than only rendering a document
that ships with it -- found that `layout` imports `webcola` statically. webcola
is a devDependency, deliberately, so that row 6.9's zero-runtime-dependency
promise survives; the published package carries no dev dependencies, so merely
loading the layout step threw ERR_MODULE_NOT_FOUND. Nothing in a render-only
probe touches layout. It packed clean and would have died in the first
stranger's terminal.

webcola is now resolved when the solver runs, not when the module loads. The
default layout is layered and needs nothing, so the common path never reaches
it; asking for `--solver` without the dependency says so in one sentence
instead of throwing a module resolution error at somebody who never chose that
library. The prepublish guard now builds a throwaway repository and maps it with
the INSTALLED cli, so the difference between "renders" and "works" is checked
where it actually shows.

Making the import lazy also removed webcola as a statically-derived component of
this repository: 19 components and 24 relationships became 18 and 23. The
figures in the README and in pipeline.svg followed, as their checks required.

And the typechecker caught a real bug in the change, not a typing nit:
`new cola.Layout()` had become `new cola().Layout()`, which constructs the
loader and then calls a method on it. Latent, because the default path never
calls the solver -- the seven solver tests found it the moment the parentheses
were right.

### The pipeline ships now, and the scanner reads .gitignore

`mirofy-cli` publishes packages/core and nothing else, so everything that maps a
repository lived in packages the registry never saw. `scripts/build-pipeline.mjs`
copies scanner, model, compile, layout and evidence into
`packages/core/pipeline/` -- git-ignored, one source of truth, still zero runtime
dependencies -- and proves the copy by running it against a throwaway repository
before it is allowed to ship. Separate packages would have meant core depending
on them, and zero dependencies is conformance row 6.9, not a preference.

Doing that immediately broke the numbers: the generated copy was scanned as if
somebody had written it, which added a component and an edge that exist nowhere
in the repository -- and only on a machine that had run the build. CI, without
that directory, derived different numbers from the same commit.

So the scanner asks git. A hard-coded skip list cannot answer this: it skips
`dist` and `build` by NAME, which both over-reaches -- a repository with real
source in `build/` loses it silently, the exact omission this scanner exists to
refuse -- and under-reaches, because generated directories with any other name
are read as source. If git cannot answer, nothing is ignored: "I could not
check" must never quietly become "there was nothing there". Both halves are
planted.

### The pipeline graphic has colour you can actually see, and a pop

Its lit fills were 2-4% tints -- `#f4f8ff` and friends, white with a rumour of
blue -- so the hue survived only on 1.5px of border and vanished at README
scale. They are now around 11%: visible, still quiet enough to sit under body
text. The SCAN / MODEL / COMPILE / LAYOUT / RENDER captions take their stage's
colour too, so there is something along the bottom edge and not just a row of
boxes.

And each stage now emits a ring as it wakes -- a rounded rect behind the box
that grows and fades, so the cascade reads as five small pops travelling left to
right. Pure transform and opacity, no filter, which keeps the promise written
into that file's own header.

The first attempt was invisible and the reason is worth keeping: the ring is
painted UNDER the box, so only the part outside it is ever seen, and the
keyframes peaked at scale 1.015 -- brightest at the exact moment it was still
hidden behind the border, then large only once it had faded to nothing. It now
appears already clear of the edge and fades while still travelling. Caught by
screenshotting the burst instant rather than trusting the markup, the same way
the original cascade bug was.

### The dark hero turned the other four captures dark, silently

Adding the dark hero broke the four capability captures in the same run. The
viewer remembers a theme choice, so pressing its theme button for `hero-dark`
persisted, and every capture after it inherited dark -- while the README text
and the commit message both said those four were deliberately light. The
screenshots and the words describing them disagreed, and nothing noticed.

Found by rendering the README through GitHub's own markdown renderer and looking
at it, which is the only reason it was caught before anyone else saw it.

Two changes. Every shot now pins its theme, with `light` as the default rather
than null, so a capture added later without thinking about it is still pinned.
And the theme is verified from the CAPTURED IMAGE, not from CSS: reading a
computed background was tried first and is useless here, because the artifact
paints an inner container and both `html` and `body` stay light in the dark
theme -- it failed a correct capture twice before that was clear. The pixels are
what a reader sees, so the pixels are what is checked.

Planted the case that matters: a step that flips the theme after the attribute
assertion has already passed, where only the image can tell. It reports
`search is dark (luma 7)`.

### The two animated graphics spent most of their loop half-built

Rendering the README the way GitHub renders it showed the problem plainly:
`evidence.svg` reached its finished state at 68% of an 11-second loop and started
fading at 88%, so the assembled record -- the passport, the citation, the gap,
the entire point of the picture -- was on screen for about two seconds in eleven.
A reader arriving mid-cycle met a mostly empty box. `pipeline.svg` had a milder
version of the same shape.

The reveal is a preamble, not the message. Both are retimed so the finished
frame holds for most of the loop: evidence now assembles by 39% and holds to
90% (5.6s of 11s, up from 2.2s), the pipeline by 37% holding to 88% (5.1s of
10s, up from 3.0s). Nothing about what they say changed, only how long they
spend saying it.

### The hero follows the reader's theme

It is captured twice now -- once in each of the viewer's themes, through the
viewer's own theme button rather than by forcing an attribute, so a screenshot
of a theme nobody can actually reach would fail instead of shipping. The README
serves them with `<picture>` and `prefers-color-scheme`, which is what the logo
at the top has always done, so a reader in dark mode stops having a white slab
dropped into their page and a reader in light mode stops having a dark one.

Only the hero. The four capability captures stay light, and not to save bytes:
they sit at about half width inside a table, and small dark thumbnails lose the
fine text -- the passport's file path and the trace's hop count -- that is the
entire reason those frames are there.

`check:readme` now reads `srcset` as well as `src`. A `<picture>` source
pointing at a missing file fails silently for exactly the readers it was added
for, and unlike a broken `<img>` it leaves no alt text behind either. A renamed
file and a one-letter `srcset` typo were both planted.

### check:size was blind to the change most likely to break it

The five screenshots took the tree to 6.1 MB against a 6 MB budget. The gate
passed locally and failed on every CI leg, because it counted `git ls-files` --
what is *already* tracked -- and the new files were still untracked when it ran.
The only way to find out was to push. That is the second gate this week with the
same shape as the changelog one, and the same fix: ask git the question CI will
ask. It now counts untracked, un-ignored files too, and a 700 KB plant proves it.

The budget itself is unchanged. The screenshots are now reduced to a 256-colour
palette, which is what PNG was built for on flat UI -- solid fills, hairlines,
mono text -- and takes the five captures from 871 KB to 359 KB with no visible
difference at any zoom worth looking at. The honest response to a budget being
hit is smaller files, not a bigger budget.

### The hero is the artifact now, and it is in colour

The top of the README was the self-model: a tall, sparse, entirely grey diagram
of twelve identical boxes. A reader met a screen and a half of it before reaching
a sentence about what the tool does.

It is now a real rendered artifact, captured from the shipped viewer -- ten
services coloured by role inside an AWS region and a security group, with the
legend naming each role. `scripts/build-screenshots.mjs` produces it and refuses
to save it unless at least four kinds actually carry colour in that diagram; a
colourful hero of a system whose colour meant nothing would argue against the
rule the README states two sections later.

The first attempt opened the Semantic Lens for extra colour and its card sat over
the right half of the diagram, hiding five of the ten nodes. A hero of a system
you cannot see is not a hero.

### The self-model stays grey, on purpose, and now says why

It moved down to sit beside the pipeline it illustrates, and its caption owns the
thing that looked like a flaw. All twelve drawn components are `config-derived`
`package` -- identical on every dimension the model records. There is no honest
axis for colour there: kind is uniform because `package` is not an architecture
schema type (row 1.20) and provenance is uniform because every one of them came
from a manifest.

Tinting them would have been the easy way to make the page livelier and would
have meant inventing a distinction the tool had not found, on the front page of a
project whose entire argument is that it does not do that.

### Two checks on the pictures themselves

Every image the README points at must exist, and the five viewer captures must be
present as a set. A renamed asset leaves a broken image on the project's front
page -- the most visible defect available, and nothing was watching for it. Both
were planted.

### check:changelog now agrees with CI about what a path is

The entry below named the scan's generated diagram. That file is real on the machine that
wrote the entry and gitignored, so `check:changelog` passed locally and then
failed on all twelve CI legs at once -- the worst shape a gate can have, because
the only way to find out is to push.

It now asks git as well as the filesystem: a path that exists but is ignored is
not a path a reader can follow. Both cases were planted, and they report
different sentences, because a bare "not found" is a baffling thing
to read on a machine where the file is plainly sitting there.

### The README shows the viewer being used, not just pictures it made

`scripts/build-screenshots.mjs` renders a real artifact, drives the shipped
viewer through real clicks in real Chrome, and saves four frames: search
narrowing a list, a Semantic Passport carrying a real citation, an upstream
trace lighting a path, and the Semantic Lens across the whole diagram.

It refuses to photograph a feature that did nothing, which it had to learn three
times. The search shot was of an unfiltered list, so it now asserts the list
shrank. The trace shot picked the first node in document order -- a source with
no upstream -- and was indistinguishable from the passport shot; it now picks the
node with the deepest reach, and the survey loop clears focus before selecting,
because re-clicking the last-surveyed node toggled the selection off and saved an
empty passport. The passport shot came from the authored example, which has no
source citations, so it showed the evidence panel with the evidence missing --
illustrating the one claim it exists to prove by not showing it. That frame now
comes from this repository, where the citation is real.

### The hero draws itself

`assets/self-model.svg` is still the real thing -- this repository, scanned by
itself, through the real pipeline -- but its dependency edges now arrive one at a
time in colour and settle to grey, instead of appearing as a finished wall.

It deliberately does not tint the boxes. All twelve components are the same kind,
`package`, and the README states the rule two sections later: colour tells you
what a node is, never where an arrow goes. Colouring them to look livelier would
break the promise the picture exists to make. The colour here is on the edges and
only while they move -- motion, not encoding.

Because the hero is generated output that a script then decorates, it can rot
with no error at all: re-running the CLI over the scan output writes a
perfectly valid hero with the animation silently gone. Three checks now stand on
it -- the decoration marker, every edge animated, and every drawn component
present -- and a plain re-render was planted to prove the first two fire.

### Adding a script changed the numbers, and the checks noticed

`build-screenshots.mjs` loads the shared browser helper through a computed
specifier, so the scanner recorded a new gap: 10 became 11. Nothing was wrong --
that gap is real and correctly refused. But `check:readme` failed on the spot,
in the README and in `pipeline.svg` at once, which is precisely what those checks
were added for a few hours earlier. Facts and cited files moved too, and are now
1,098 across 198.


### The README graphic was stating four numbers, three of them wrong

`assets/pipeline.svg` said 230 files, 987 facts and 8 gaps. The repository was
at 196, 1,089 and 10. Nobody had lied -- the figures were true when they were
drawn -- but an SVG is not somewhere anyone thinks to look for stale numbers,
which is exactly what makes it the good hiding place.

This is the same defect `check-readme-claims.mjs` was written to kill in the
prose, so the graphics now answer to it too: every figure in `pipeline.svg` is
re-derived from a live scan, and `assets/evidence.svg` -- which quotes one whole
fact as its proof that every drawn edge carries a source -- is checked against
the evidence graph, down to the file, the line, the provenance class and the
recorded gap it quotes. A graphic arguing "nothing is inferred silently" and
illustrated with an invented citation would have been a small demonstration of
the opposite.

The README's own scan figures were two commits stale and inside the checker's
tolerance, so nothing had complained. They are level again.

### The artifact fetches a webfont, and the README said "no network"

Writing an offline check made it fail on the first run. The viewer pulls
JetBrains Mono from `fonts.googleapis.com`, so opening a delivered artifact also
tells Google somebody opened it.

The artifact does render completely without it -- the link is `media="print"`
with an `onload`, so it never blocks paint, and the stack falls back to system
monospace. But "it degrades nicely" is not "no network". Rather than write the
check around the thing that broke it, the check now proves the stronger claim
that is actually true: **nothing the artifact needs comes from the network.**
Every external reference must be a font, and every font reference must be in a
form that cannot block first paint or change what the diagram says -- a CDN
script, a remote image, a CSS `url()`, or that same font link with its async
attributes removed all fail it. Both were planted and both failed before this
was believed.

A second check keeps the prose and the artifact in step in *both* directions: it
fails if the README overstates what is fetched, and fails just as loudly if the
fetch is ever removed and the caveat is left behind.

Whether to drop the webfont entirely is a visual decision, not a correctness
one, and is left open.

### Colour, motion, and a cascade that is not built from delays

`pipeline.svg` now walks the logo's blue-to-violet gradient across its four
working stages and lands on emerald for the artifact, with each connector
drawing across its gap as the handover happens. `evidence.svg` is new: an edge
lights, its Semantic Passport opens, four rows of the record resolve, a verified
badge stamps, and the gap the scanner refused to guess appears underneath.

Both encode the cascade in keyframe percentages rather than `animation-delay`.
The obvious way -- one keyframe set, five delays -- is wrong: a stage still lit
when the shared loop restarts reappears underneath the stage that should be
alone on screen, and a mid-cycle frame showed stages 1 and 5 lit with 2, 3 and 4
dark. Caught by screenshotting four pinned frames rather than trusting the
markup.

### The screenshots are captioned as claims now

The gallery block read as a lookbook and had the same shape as the upstream
project's. Same images, but each one now states a claim and names what proves it
-- conformance row 4.16, conformance row 1.1, and the network check above.


### `bin` entries are executable, and one of them could not have run

`npm ci` sets the executable bit on every declared `bin`, and git tracks that —
so a bin committed as `644` is *modified* the moment CI installs, and the
publish guard refused a perfectly good tree on a fresh checkout.

Fixing that turned up the real one: `packages/mcp/bin/mcp.mjs` is declared as a
`bin` and had **no shebang**. Installed globally on POSIX, `mirofy-mcp` would
have installed cleanly and then failed the first time anyone typed it. Both are
now checked.

### The gate now checks the lockfile

Renaming the workspace package from `@mirofy/core` to `mirofy` passed
`npm run check` locally and failed **all twelve CI jobs**: `npm ci` refuses to
install when the manifests and `package-lock.json` disagree, and nothing local
noticed because `node_modules` was already sitting there.

So the whole gate could pass on a machine where the project would not install at
all — which is the worst shape a green check can have. `check:lockfile` compares
every workspace's name and version against the lockfile, then asks npm itself
with `npm ci --dry-run`.

### The README stopped promising a command that 404s

It told readers to run `npx mirofy demo`. `mirofy` is not published yet, so
that was a 404 on somebody's **first contact** with the project. The install
section now uses the from-source commands, which work today, and says plainly
why there is no npx line.

`check-readme-claims.mjs` asks the registry and enforces whichever of the two
is currently true — including the opposite mistake, a caveat still apologising
a month after publication, which is likelier because nobody goes back to delete
one.

The first version of that check **passed both planted faults**. It resolved npm
by name and ran `node npm view …`, which fails for a reason that is not a 404,
so it concluded "could not reach the registry" and reported ok. A check that
cannot run is not a check that succeeded, and it now says so in its own name
rather than quietly counting as a pass.

### The CLI stopped telling you to run a command you may not have

Every usage line began with a bare `mirofy`. Run from a clone — which the README
recommends, because it works with no install — that is a command the reader does
not have, so every line of help was unpasteable.

It now leads with how it was actually invoked: `node packages/core/bin/mirofy.mjs
render …` from a checkout, `mirofy render …` once installed. Neither is a guess
about the reader's shell; both are what happened.

### Trusted publishing, and a token that would have silently undone it

Releases now authenticate with the OIDC token GitHub mints for the publish
workflow. No long-lived credential exists to leak or rotate.

The publish step still passed `NODE_AUTH_TOKEN` from a secret, left from before.
It was harmless only because the secret was never created — and it was a trap:
**npm prefers a token when one is present.** Adding an `NPM_TOKEN` for any
reason would have quietly replaced OIDC with exactly the kind of long-lived
credential trusted publishing exists to avoid, and provenance would have stopped
appearing with no error to notice. It is gone.

Package publishing access is npm's strictest — *require 2FA and disallow bypass
2FA tokens* — and it is the right setting **because** nothing here publishes
with a token. The looser option exists to grandfather in granular tokens that
bypass 2FA, the mechanism npm is deprecating; a trusted-publishing credential is
not one of those. It is minted per workflow run, expires in minutes, and is
bound to this repository and this file.

`0.1.0` carries no provenance attestation and never will: it was published from
a laptop, and only a runner can prove its identity to npm. The next release will.

### Published — `mirofy-cli@0.1.0`

```
npx mirofy-cli demo
```

Live on npm, MIT, no dependencies, 596 kB packed / 71 files. Verified by
installing from the registry into an empty directory and rendering: 799 ms to
install, a 718 kB diagram out.

The README now leads with `npx`. It was told to by
`scripts/check-readme-claims.mjs`, which watches the registry and had been
holding the shorter instructions back precisely until this was true — the
gate failed on the next run after publishing, unprompted, with the exact
change to make.

### Two names that were written down instead of read

The publish guard's last line — the one somebody reads immediately before
uploading — said `mirofy@0.1.0` for a full CI run *after* the package had been
renamed. So did the workflow's tag check. Both read the manifest now.

And a re-pushed tag is no longer an error. The first release went up by hand,
because npm cannot configure a trusted publisher for a package that does not
exist, so this workflow will meet a version already on the registry. *Already
published* is a true statement about a successful release, not a failure.

### The package is `mirofy-cli`, because npm refused `mirofy`

> 403 Forbidden — Package name too similar to existing package `minify`

npm runs a typosquatting check at publish time, `minify` is a real package with
15.3.1 published, and `mirofy` falls inside its similarity threshold. There is
no retrying that.

`mirofy-cli` it is — and **the command it installs is still `mirofy`**, which is
what anyone actually types. The manifest declares both bins pointing at one
file, so `npx mirofy-cli` resolves without npx having to guess which binary a
differently-named package meant.

The publish guard read `node_modules/mirofy` from a hardcoded string, which
would have failed the install probe for a reason that had nothing to do with
whether the tarball worked. It reads the name from the manifest now.

### The repository presents itself

It was public with an **empty description**, no homepage link, and no topics —
which reads as abandoned however good the code is. All three are set, and the
homepage points at the live site that already existed.

Secret scanning, **push protection**, Dependabot alerts and private
vulnerability reporting are on. Push protection is the one that matters: it
would refuse a future accidental key paste at the push, rather than after.

A ruleset on `main` blocks force-push and deletion, and deliberately does *not*
require pull requests — a guardrail that breaks a solo maintainer's workflow
gets turned off, and then there is no guardrail.

`SECURITY.md` said *"this repository has no remote yet"* on a hosted public
repo, and `CONTRIBUTING.md` said CI "has not yet executed on a runner" after
hundreds of runs. Both rewritten. Added: a code of conduct, three issue
templates, a pull request template, and `CITATION.cff`.

The third issue template is the one worth having — *"a diagram came out wrong"*.
A validation error is easy, because the tool already knows. A diagram that
passes every gate and still reads badly is a **missing** gate, and those are
found by people looking at pictures.

### The publish guard learned how to call npm on Windows

Both obvious ways are wrong there. `shell: true` concatenates arguments instead
of escaping them, and Node prints a security warning about it on every run — the
last thing anyone should be reading immediately before a publish is a warning
they have decided to ignore. Naming `npm.cmd` directly fails with `EINVAL`,
because Node refuses to spawn a `.cmd` without a shell; that is the mitigation
for CVE-2024-27980, not a bug.

It runs npm's own `npm-cli.js` on the Node already present. npm sets
`npm_execpath` to exactly that when it runs a script, which is the only context
this guard really executes in.

Found by running the guard rather than reading it — twice, because the first
attempt swapped one broken invocation for another.

---

## 2026-08-31

### The layout engine started passing its own gates

Clean Flow makes three demands of a route: leave and arrive through the sides
the endpoints declare, cross no unrelated node, and cross a container's border
rather than run along it. **The routers enforced two of them.**

- **Architecture** was blind to the third, and not by chance: a boundary is
  drawn a fixed pad outside its members, which puts its edge near the middle of
  the gap between a row inside it and a row outside — exactly where a dogleg's
  corridor wants to sit. It now asks the gate's own collector, keeps the natural
  corridor when it is clear, and nudges only when it must.
- **Workflow's cross-lane fallback was returned with no check at all** — no side
  test, no clearance test, unlike every other route it produces. One benchmark
  edge failed six endpoint-side and three edge-through-node assertions from that
  single unchecked drop. The candidate it was missing: an edge leaving a *right*
  side and arriving at a *left* one can only put its vertical leg **between** the
  two x values.
- **Lifecycle's bands were narrower than the schema they serve.** `col` accepts
  0–4; the event and outcome bands offered three slots, and `measureState`
  silently *clamped* an out-of-range column onto its neighbour — so the overlap
  gate reported collisions nobody wrote. Slots are appended at the existing
  pitch, so columns 0–2 keep the exact x they always had.
- **Every lifecycle event lane shared one `y`.** Two lanes with a state in the
  same column landed on the identical point, and the renderer answered *"separate
  them with yOffset"* — asking for a row it could derive. The bundled example
  settles it: a hand-written `yOffset: 78`, precisely one row.

Over the fixed benchmark corpus: **34 composition errors → 15**.

### Boxes grow to their text instead of asking for shorter words

A diagnostic that reads *"shorten the label or widen size"* asks an author to
rename part of the system they are drawing to fit a box the renderer picked.

One rule decided all of it: **grow what the tool chose, never what the author
chose.** Sequence participants, workflow nodes and architecture grid components
now fit their text up to a shared 190px ceiling; workflow columns re-solve when
the defaults cannot hold them; lanes grow for the deepest `yOffset`. An authored
`size`, `width`, `yOffset` or `viewBox` is never overridden.

The workflow column array is worth naming: its gaps were as narrow as **70px**,
and two 92px nodes cannot both sit in 70px. Any document with same-lane nodes in
columns 3 and 4 overlapped by construction.

### Edge labels are solved, not suggested

The old hint moved a label clear of the one obstacle it hit and never checked
whether the new spot was occupied. `label-placement.mjs` walks a ladder of
candidates and takes the first that touches nothing — nodes, other labels, or
routes. **An authored `labelAt`/`labelDx`/`labelDy` is never moved**; automatic
labels route around it.

### `--format svg-static` exports the document's preset

It collected every token block whose selector did not mention `data-preset` —
which is all ten preset blocks. Six presets produced one file, byte for byte.
The same line decided the theme by accident, too: whichever base block came last
won. Both are now resolved through the cascade, and the theme is *chosen*
(light, because a static SVG carries no background and lands on whatever ground
it is pasted onto).

### The benchmark can separate the tool from the model

`--keep` saves what an author produced; `--replay` re-runs the tool over those
exact documents without calling the model again. Until this existed every re-run
changed both the documents and the tool, so **no movement could be attributed to
either** — which is most of why weeks of work produced no number anyone could
point at. A replay cannot claim a different author: the model is read from the
saved manifest and `--model` is refused if it disagrees.

The rate is published in the README under a heading that says we would rather
not: **2 of 8**.

### The `main` lane rule is where an author can read it

A lifecycle diagram must have a lane called `main`. The schema said lanes were
one to four entries with any id, so a document could be schema-valid and then
refused by a rule expressed nowhere reachable. The schema says it now, the
collection's description travels with the error, and
`benchmarks/authors/schema-brief.mjs` — which generates the author's
instructions *from* the schema — carries it.

`04-order-state` is consequently classified **invalid** rather than as a
composition failure. It was always an author error; the harness was charging it
to the layout engine.

### A public proof site, rebuilt from every commit

[hasan-laraib.github.io/Mirofy](https://hasan-laraib.github.io/Mirofy/). The
hero is this repository's own architecture, built by running the real scan
pipeline — so **if scanning this repository ever breaks, the site build fails**.
Nothing is committed: the site is always produced by the code at the commit it
describes.

### Every number in the README is checked

A review found three wrong at once — the matrix had grown from 97 rows to 99 and
from 77 proved to 79, and the test count was 29 behind. None dishonest; all true
when written. `scripts/check-readme-claims.mjs` derives them: it counts the
matrix, reads the tool list the MCP server serves, renders an artifact to measure
it, re-runs the scan, and re-runs the benchmark.

### An installable skill bundle

`npm run build:skill` assembles `dist/mirofy/` — 2.8 MB against `packages/core`'s
3.7 MB, and named for the skill inside it. Copying `packages/core` instead
installs a skill called **core** that declares in its own frontmatter that it is
called **mirofy**; the manual instruction hid that because it names the
destination, but nothing that walks a tree does.

Before writing it, the build copies the result somewhere with no repository
around it and renders a diagram. A bundle that only works inside its own
checkout is not a bundle, it is a directory. It also refuses a directory in
`packages/core` that it neither ships nor records a reason for skipping — the
decision belongs to whoever adds it, not to a user who finds it missing.

### Publishable as `mirofy`, and versioned from its own line

The package is `mirofy` — one word, so `npx mirofy` is the whole installation
step. `npx mirofy demo` produces a finished artifact and `npx mirofy init`
writes a starter document of your own, which is the gap between them that
nothing filled: `demo` shows what the tool does and teaches nothing about the
document behind it.

**`0.1.0`, not `2.16.0`.** The old number came down the fork's version line, and
publishing a brand-new package at 2.16.0 implies a 2.15 that never existed
publicly. This is release one of something whose benchmark is 2 of 8; calling it
1.0 would be a claim about stability nobody has earned.

`prepublishOnly` refuses to publish unless the whole gate passes, the working
tree is clean, and the packed tarball installs into an empty directory and
renders. Deliberately slow: npm allows an unpublish for 72 hours and then the
version number is spent forever.

`.github/workflows/publish.yml` publishes on a version tag **with provenance** —
npm records which repository and commit built the tarball, a signed claim a
reader can check rather than take on trust. That is what this project asks of
every diagram it draws, and shipping the tool itself on "I ran it on my laptop"
would be strange. It needs one manual publish first, because npm cannot
configure a trusted publisher for a package that does not exist.

### One tag removed

`provenance-anchor` is deleted. It was local-only, never pushed, and asserted
that `packages/core` was byte-identical to an upstream commit — which stopped
being true a long time ago, and named the upstream project in a message. It was
the last reference to 50 superseded commits from before the history rewrite; the
content of all of them is on `main` in rewritten form.

### Also

- `repair` accepts all five diagram types. Only architecture permits node
  `pos`/`size`, so widening and separation are architecture-only **by schema**;
  sequence has neither sides nor geometry and now says so rather than reporting a
  clean run over a document it never touched.
- The Mirofy logo, prepared as light and dark variants by recovering ink colour
  and coverage from the white it was composited over.

### Removed

- **A crossing-avoidance pass.** Correct, and measured over the corpus it changed
  nothing on any document while costing an O(n²) crossing count per candidate on
  every render.
- **A floor for the outcome band.** It could never differ from 450: the schema
  caps lanes at four, and a diagram with an outcome band spends two on `main` and
  `terminal`. Replaced by a guard that becomes reachable if the cap ever rises.

---

## 2026-08-30

- **Ports never aim at a blocked or contested axis** (row 3.16). The first fix
  pinned a fallback port to the side's *centre*, which is the blocked axis; the
  corrected version uses the even-spread slot.
- **The test runner ran `packages/core/test`** instead of skipping all 82 files
  in it.
- **The quarantine was emptied**, and the two real bugs it was hiding were fixed.
  Five of the seven dormant failures were stale exact coordinates; two were real
  Clean Flow rejections.
- **First-pass usable rate measured on a schedule** (row 7.8).

---

## 2026-08-29

The foundation, imported and then made provable.

- **Renderers, schemas, viewer and CLI** imported at a recorded baseline, with
  golden digests pinning renderer parity.
- **The conformance matrix**: one row per imported requirement, each naming the
  test that proves it. A row counts as proved only when its named test passes,
  matched character-for-character — a proof file that exits zero while its own
  test was renamed counts as **unproven**.
- **Per-row title verification** extended to every row after file-level
  accounting let fourteen browser rows read "proved" when only four had a real
  assertion.
- **Real headless Chrome** drives the viewer rows; browser rows never count
  toward the proved total unless a browser actually ran them.
- **CI across three platforms and four Node versions**, with artifact, size and
  audit gates wired into one `check` chain.
- **`check:drift`** pins `packages/core` integrity: the gate does not say a
  change is wrong, it says nobody has said it is right.
