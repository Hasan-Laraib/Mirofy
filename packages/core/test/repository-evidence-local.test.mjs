// A repository on a forge Mirofy does not recognise -- a self-hosted GitLab,
// an internal Gitea, an enterprise GitHub -- renders its source evidence
// instead of failing the render outright.
//
// These live in their own file, separate from repository-evidence.test.mjs,
// because that file is quarantined out of `npm test` for two pre-existing
// failures of its own (see scripts/run-tests.mjs). Tests that cannot fail CI
// are not evidence of anything, and this behaviour is the whole point of the
// change it covers.
//
// This task ships the unrecognised / self-hosted host case: a WELL-FORMED URL
// on a forge we do not recognise. It does NOT ship a repository with no remote
// at all -- that is blocked upstream, unmodified by this task, by the schema's
// required `/meta/repository/url` and by the origin-remote-required check in
// repository-evidence.mjs -- and is deferred to a follow-up plan.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { verifyRepositoryEvidence } from '../renderers/shared/repository-evidence.mjs';
import { HOST_IDS } from '../renderers/shared/hosts.mjs';
import { diagramCitingSource, fixture, git, skillRoot } from './helpers/evidence-repo.mjs';

const UNRECOGNISED_HOST_URL = 'https://git.self-hosted.example/team/widgets';

test('a repository on an unrecognised host renders instead of failing', () => {
  const repo = fixture();
  const result = verifyRepositoryEvidence(
    'architecture',
    diagramCitingSource(repo, UNRECOGNISED_HOST_URL),
    repo.root,
  );
  assert.equal(result.verified, true);
  assert.equal(result.repository.host, 'local');
  assert.equal(result.repository.treeUrl, null);
});

test('a local repository reports one limitation naming it', () => {
  const repo = fixture();
  const result = verifyRepositoryEvidence(
    'architecture',
    diagramCitingSource(repo, UNRECOGNISED_HOST_URL),
    repo.root,
  );
  assert.equal(result.limitations.length, 1);
  assert.match(result.limitations[0].reason, /cannot be linked/);
  assert.equal(result.limitations[0].declaredUrl, UNRECOGNISED_HOST_URL);
  // The single-repository form declares no id of its own (the reserved id is
  // ''), so "naming it" must fall back to something else -- the verified
  // checkout path -- rather than silently reporting an empty string.
  assert.equal(result.limitations[0].repository, fs.realpathSync(repo.root));
});

test('an unrecognised forge is named by its declared URL', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'https://git.internal.example/owner/repo');
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal(result.repository.host, 'local');
  assert.equal(result.limitations[0].declaredUrl, 'https://git.internal.example/owner/repo');
});

test('one limitation per repository, not per cited source location', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, UNRECOGNISED_HOST_URL, { locations: 3 });
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal(result.limitations.length, 1);
});

test('a hosted repository carries no limitations key at all', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'https://github.com/owner/repo');
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal('limitations' in result, false);
});

test('a malformed url is still a hard failure, naming the supported hosts', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'not a url at all');
  // The thrown Error's own `.message` is the human-readable diagnostic text,
  // not the diagnostic code (see diagnostics.mjs's normalizedDiagnostic) --
  // the code rides alongside on `mirofyDiagnostics`, so that is asserted
  // directly rather than by matching the message against it.
  try {
    verifyRepositoryEvidence('architecture', diagram, repo.root);
    assert.fail('expected verifyRepositoryEvidence to throw');
  } catch (error) {
    assert.equal(error.mirofyDiagnostics?.[0]?.code, 'repository-evidence/url-invalid');
    // Naming the supported hosts is the difference between a dead end and a
    // fixable error: the author cannot guess which forges are understood.
    for (const id of HOST_IDS) {
      assert.match(error.message, new RegExp(id), `the rejection does not name the ${id} adapter`);
    }
  }
});

test('an unrecognised origin that does not match the declared URL is still rejected', () => {
  // remoteSlug(origin) and remoteSlug(declaredUrl) are both null for two
  // different unrecognised hosts, so `remoteSlug(a) !== remoteSlug(b)` alone
  // cannot tell them apart -- without the text-comparison fallback in
  // `sameRemote`, this origin-mismatch check goes inert for every
  // unrecognised host and accepts ANY two unrelated self-hosted remotes.
  const repo = fixture();
  const diagram = diagramCitingSource(repo, UNRECOGNISED_HOST_URL);
  git(repo.root, 'remote', 'set-url', 'origin', 'https://git.totally-unrelated.example/someone/else');
  assert.throws(
    () => verifyRepositoryEvidence('architecture', diagram, repo.root),
    (error) => error.mirofyDiagnostics?.[0]?.code === 'repository-evidence/origin-mismatch',
  );
});

test('the viewer template never synthesises a repository url', () => {
  assert.equal(
    /repository\.url \+ '\/tree\/'/.test(template()), false,
    'template.html must not build a tree URL by string concatenation',
  );
});

// ---------------------------------------------------------------------------
// The viewer half. A local artifact ships `{url, slug: null, host: 'local',
// treeUrl: null}`, and the passport renderer has to survive that payload AND
// say something useful about it. The regression this guards is a real one: a
// slug derivation that read `repository.url.replace(...)` threw a TypeError on
// every local artifact, and `renderSourceEvidence` is called bare, so the
// first click on any component with sources took the whole evidence panel
// down -- no repository line, no file links, no provenance class.
// ---------------------------------------------------------------------------

function template() {
  return fs.readFileSync(path.join(skillRoot, 'assets', 'template.html'), 'utf8');
}

/**
 * `renderSourceEvidence`, lifted out of the built template and made callable.
 *
 * Running the shipped function beats asserting on its source text: the thing
 * that broke was its BEHAVIOUR on a null url, and a regex over the template
 * would have passed against any number of rewrites that still throw. The
 * function is delimited by its own indentation in the generated file (six
 * spaces for the declaration, six for the closing brace), which the viewer
 * build produces deterministically.
 */
function passportRenderer(repositoryPayload) {
  const source = template();
  const start = source.indexOf('      function renderSourceEvidence(');
  assert.notEqual(start, -1, 'renderSourceEvidence is missing from the built template');
  const end = source.indexOf('\n      }\n', start);
  assert.notEqual(end, -1, 'could not find the end of renderSourceEvidence');
  const body = source.slice(start, end + '\n      }'.length);

  // `tagName` is recorded so a test can tell the three slots of a source
  // entry apart -- <strong> label, <code> location, <small> path -- which
  // matters once the <code> slot is conditional.
  const element = (tagName) => ({
    tagName,
    attributes: Object.create(null),
    children: [],
    textContent: '',
    hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'href') delete this.href; },
    appendChild(child) { this.children.push(child); },
  });
  const evidence = element();
  const evidenceLinks = element();
  const repositoryLink = element();
  const provenanceSlot = element();
  const doc = { createElement: (tagName) => element(tagName) };
  const Mirofy = { sourceEvidence: { repository: () => repositoryPayload } };
  const viewerText = (key) => key;

  // `new Function` deliberately: running the shipped artifact code under a
  // stub DOM is the point, and a regex over its text would not have caught
  // the TypeError this test exists for.
  const make = new Function(
    'evidence', 'evidenceLinks', 'repositoryLink', 'provenanceSlot', 'document', 'Mirofy', 'viewerText',
    `${body}\nreturn renderSourceEvidence;`,
  );
  return {
    render: make(evidence, evidenceLinks, repositoryLink, provenanceSlot, doc, Mirofy, viewerText),
    evidence,
    evidenceLinks,
    repositoryLink,
    provenanceSlot,
  };
}

const LOCAL_PAYLOAD = Object.freeze({
  url: 'https://git.self-hosted.example/team/widgets',
  revision: 'c'.repeat(40),
  shortRevision: 'ccccccc',
  host: 'local',
  slug: null,
  treeUrl: null,
});

const HOSTED_PAYLOAD = Object.freeze({
  url: 'https://github.com/example/evidence-repo',
  revision: 'a'.repeat(40),
  shortRevision: 'aaaaaaa',
  host: 'github',
  slug: 'example/evidence-repo',
  treeUrl: 'https://github.com/example/evidence-repo/tree/' + 'a'.repeat(40),
});

const SOURCES = Object.freeze([{ path: 'src/router.js', line: 1, href: null }]);

test('the passport renders a local artifact instead of throwing', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(SOURCES, 'observed', 0);
  // The whole panel survives -- this is what the TypeError took down.
  assert.equal(view.evidence.hidden, false);
  assert.equal(view.evidenceLinks.children.length, 1);
  assert.equal(view.provenanceSlot.textContent, 'observed');
});

test('a local repository shows its declared URL whole, as unlinked text', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(SOURCES, '', 0);
  // Whole, scheme and domain included: on a self-hosted forge the domain is
  // what says WHICH forge, and with no anchor to click it is the only place a
  // human sees a mistyped host (guthub.com) rather than losing it to the
  // embedded JSON.
  assert.equal(view.repositoryLink.textContent, 'https://git.self-hosted.example/team/widgets @ ccccccc');
  assert.equal(view.repositoryLink.hidden, false);
  assert.equal(view.repositoryLink.href, undefined);
  assert.equal('href' in view.repositoryLink.attributes, false);
  // "Open verified repository revision ..." on something that cannot be
  // opened is the same overclaim, just in the accessibility tree.
  assert.equal('aria-label' in view.repositoryLink.attributes, false);
});

test('an artifact older than both fields still renders', () => {
  // Artifacts built before `slug`, `host` and `treeUrl` existed carry none of
  // them. The derivation must tolerate that rather than reading through it.
  const view = passportRenderer({ url: 'https://github.com/example/evidence-repo/', revision: 'b'.repeat(40), shortRevision: 'bbbbbbb' });
  view.render(SOURCES, '', 0);
  assert.equal(view.repositoryLink.textContent, 'example/evidence-repo @ bbbbbbb');
  assert.equal(view.evidence.hidden, false);
});

test('a hosted repository still links, strips, and labels exactly as before', () => {
  const view = passportRenderer(HOSTED_PAYLOAD);
  view.render(SOURCES, 'verified', 0);
  assert.equal(view.repositoryLink.textContent, 'example/evidence-repo @ aaaaaaa');
  assert.equal(view.repositoryLink.href, HOSTED_PAYLOAD.treeUrl);
  assert.equal(view.repositoryLink.hidden, false);
  assert.equal(view.repositoryLink.attributes['aria-label'], 'viewer.passport.repository.open');
});

test('a local repository declared with no url at all does not throw either', () => {
  // Not a shape production emits -- an origin remote is still required, and
  // the schema still requires /meta/repository/url -- but the viewer is asked
  // to render whatever an artifact carries, and must not take the panel down
  // over a field it does not have.
  const view = passportRenderer({ host: 'local', revision: 'd'.repeat(40), shortRevision: 'ddddddd', url: null, slug: null, treeUrl: null });
  view.render(SOURCES, '', 0);
  assert.equal(view.evidence.hidden, false);
  assert.equal(view.repositoryLink.textContent, 'ddddddd');
});

test('a local repository carries its declared url into the artifact payload', () => {
  // `prepareRepository` used to return `host.web`, which the local adapter
  // answers as null -- so the artifact shipped `url: null` and the viewer had
  // nothing to show even once it stopped throwing.
  const repo = fixture();
  const result = verifyRepositoryEvidence(
    'architecture',
    diagramCitingSource(repo, UNRECOGNISED_HOST_URL),
    repo.root,
  );
  assert.equal(result.repository.url, UNRECOGNISED_HOST_URL);
  assert.equal(result.repositories[0].url, UNRECOGNISED_HOST_URL);
});

test('a hosted repository keeps the canonical forge url, not the declared spelling', () => {
  // The declared URL and the canonical one differ here (trailing .git), so
  // this fails if the local-host fallback ever starts preferring the declared
  // value for a recognised forge.
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'https://github.com/owner/repo.git');
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal(result.repository.url, 'https://github.com/owner/repo');
  assert.equal(result.repository.host, 'github');
});

// ---------------------------------------------------------------------------
// The cited source locations, which are the same defect as the repository
// line one element above, repeated once per citation -- and a diagram cites
// far more source lines than repositories. `link.href = source.href` with a
// null href serialises as href="null": a clickable dead link that resolves
// against the artifact's own URL, wearing an "Open verified source ..." label
// and a ' ↗' glyph that both promise a destination. Design §3: "With a null
// href it emits the same text unlinked."
// ---------------------------------------------------------------------------

const LOCAL_LINE = Object.freeze([{ path: 'src/router.js', line: 1, href: null }]);
const LOCAL_RANGE = Object.freeze([{ path: 'src/router.js', line: 4, endLine: 9, href: null }]);
const LOCAL_NO_LINE = Object.freeze([{ path: 'src/router.js', href: null }]);
const HOSTED_BLOB = 'https://github.com/example/evidence-repo/blob/' + 'a'.repeat(40) + '/src/router.js#L1';
const HOSTED_LINE = Object.freeze([{ path: 'src/router.js', line: 1, href: HOSTED_BLOB }]);
const HOSTED_RANGE = Object.freeze([{ path: 'src/router.js', line: 4, endLine: 9, href: HOSTED_BLOB }]);
const HOSTED_NO_LINE = Object.freeze([{ path: 'src/router.js', href: HOSTED_BLOB }]);

/** The one source entry the passport rendered, as {tag: text} pairs in order. */
function entryOf(view) {
  assert.equal(view.evidenceLinks.children.length, 1);
  const entry = view.evidenceLinks.children[0];
  return { entry, slots: entry.children.map((child) => [child.tagName, child.textContent]) };
}

test('an unlinkable source location renders as text, not as href="null"', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(LOCAL_LINE, '', 0);
  const { entry } = entryOf(view);
  // The whole point: nothing a browser will serialise into an href.
  assert.equal(entry.href, undefined);
  assert.equal('href' in entry, false);
  assert.equal('href' in entry.attributes, false);
});

test('an unlinkable source location carries no link affordances', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(LOCAL_LINE, '', 0);
  const { entry } = entryOf(view);
  assert.equal(entry.target, undefined);
  assert.equal(entry.rel, undefined);
  assert.equal(entry.referrerPolicy, undefined);
  // "Open verified source ... " on something that cannot be opened is the
  // same overclaim as the repository line's, just in the accessibility tree.
  assert.equal('aria-label' in entry.attributes, false);
  // Still styled and positioned as before: the fix is about what the entry
  // claims, not about where it sits.
  assert.equal(entry.className, 'semantic-passport-source');
});

test('an unlinkable source location keeps its label, line range and path', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(LOCAL_RANGE, '', 0);
  const { slots } = entryOf(view);
  // Same information, same three slots, same order -- only the claim of
  // openability is gone. The location string is what design §3 pins.
  assert.deepEqual(slots, [
    ['strong', 'router.js'],
    ['code', 'L4–9'],
    ['small', 'src/router.js'],
  ]);
});

test('an unlinkable source location shows no glyph and no "Open" wording', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(LOCAL_LINE, '', 0);
  const { slots } = entryOf(view);
  const text = slots.map(([, value]) => value).join(' ');
  assert.equal(/↗/.test(text), false, 'the arrow glyph advertises a link that does not exist');
  assert.equal(/openLink|\.open\b/.test(text), false, 'no string may offer to open an unlinkable citation');
});

test('an unlinkable source location with no line range omits the location slot', () => {
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render(LOCAL_NO_LINE, '', 0);
  const { slots } = entryOf(view);
  // Today's fallback for a source with no line range is the bare invitation
  // "Open ↗", which is nothing but an affordance. With nothing to link there
  // is nothing to put here: the path is already on the line below.
  assert.deepEqual(slots, [
    ['strong', 'router.js'],
    ['small', 'src/router.js'],
  ]);
});

test('a hosted source location links exactly as it did before', () => {
  const view = passportRenderer(HOSTED_PAYLOAD);
  view.render(HOSTED_LINE, '', 0);
  const { entry, slots } = entryOf(view);
  assert.equal(entry.href, HOSTED_BLOB);
  assert.equal(entry.target, '_blank');
  assert.equal(entry.rel, 'noopener noreferrer');
  assert.equal(entry.referrerPolicy, 'no-referrer');
  assert.equal(entry.attributes['aria-label'], 'viewer.passport.source.open');
  assert.equal(entry.className, 'semantic-passport-source');
  assert.deepEqual(slots, [
    ['strong', 'router.js'],
    ['code', 'L1 ↗'],
    ['small', 'src/router.js'],
  ]);
});

test('a hosted source location keeps its range and its "Open ↗" fallback', () => {
  const range = passportRenderer(HOSTED_PAYLOAD);
  range.render(HOSTED_RANGE, '', 0);
  assert.deepEqual(entryOf(range).slots[1], ['code', 'L4–9 ↗']);
  const bare = passportRenderer(HOSTED_PAYLOAD);
  bare.render(HOSTED_NO_LINE, '', 0);
  assert.deepEqual(entryOf(bare).slots[1], ['code', 'viewer.passport.source.openLink']);
});

test('a source label overrides the derived basename either way', () => {
  // The label branch is untouched by the conditional, and a test that only
  // ever passed unlabelled sources would not notice if it moved.
  const local = passportRenderer(LOCAL_PAYLOAD);
  local.render([{ path: 'src/router.js', label: 'Router', line: 1, href: null }], '', 0);
  assert.equal(entryOf(local).slots[0][1], 'Router');
  const hosted = passportRenderer(HOSTED_PAYLOAD);
  hosted.render([{ path: 'src/router.js', label: 'Router', line: 1, href: HOSTED_BLOB }], '', 0);
  assert.equal(entryOf(hosted).slots[0][1], 'Router');
});

test('every cited location on a local artifact is unlinked, not just the first', () => {
  // The repository line was fixed one round ago and the sources were not, so
  // "one element is handled" is exactly the failure mode to pin here.
  const view = passportRenderer(LOCAL_PAYLOAD);
  view.render([
    { path: 'src/router.js', line: 1, href: null },
    { path: 'src/server.js', line: 12, endLine: 20, href: null },
    { path: 'src/db/index.js', href: null },
  ], '', 0);
  assert.equal(view.evidenceLinks.children.length, 3);
  for (const entry of view.evidenceLinks.children) {
    assert.equal('href' in entry, false);
    assert.equal('aria-label' in entry.attributes, false);
    assert.equal(entry.children.some((child) => /↗/.test(child.textContent)), false);
  }
});
