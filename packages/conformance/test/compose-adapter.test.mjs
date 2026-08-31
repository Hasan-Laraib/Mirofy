// Row 2.12. Docker Compose adapter.
//
// A compose file is the closest thing most repositories have to a written
// deployment topology, and it is configuration rather than code -- so every
// fact is `config-derived`. The file says what it says; nothing is inferred
// from it about runtime behaviour.
//
// Compose is YAML and this repository has zero runtime dependencies, so there
// is no parser to reach for. Rather than pretend otherwise, the adapter reads
// the SUBSET compose files use for topology and turns everything else into a
// Gap naming the line. That is the scanner rule applied to its own limits: an
// unparseable construct is reported, never skipped quietly, because a service
// silently dropped is a service missing from the diagram with nothing to
// explain the hole.
//
// The line it refuses to cross is the interesting one. `depends_on` is a
// DECLARED dependency and becomes a fact. Two services sharing a network are
// not recorded as talking to each other: a shared network is permission, not
// communication, and a diagram that draws that difference wrongly is worse
// than one that omits it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composeAdapter, parseComposeSubset } from '../../scanner/src/adapters/compose.mjs';

function withCompose(body, name = 'docker-compose.yml') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-compose-'));
  fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const FULL = `version: "3.9"
services:
  web:
    image: nginx:1.25
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
  api:
    build:
      context: ./api
    ports:
      - "8080:8080"
    depends_on:
      - db
  db:
    image: postgres:16
networks:
  default:
    driver: bridge
`;

test('[2.12] services, images, ports and declared dependencies become facts', async () => {
  const result = await composeAdapter.scan({ repoRoot: withCompose(FULL), revision: 'abc' });
  const said = result.facts.map((f) => `${f.subject} ${f.predicate} ${f.object}`);

  assert.ok(said.includes('web runs-image nginx:1.25'));
  assert.ok(said.includes('db runs-image postgres:16'));
  assert.ok(said.includes('api builds-from ./api'));
  // Both ports, not just the first: a sequence read as a scalar loses every
  // entry after the one it happened to keep.
  assert.ok(said.includes('web publishes-port 80:80'));
  assert.ok(said.includes('web publishes-port 443:443'));
  assert.ok(said.includes('web depends-on api'));
  assert.ok(said.includes('api depends-on db'));
  assert.equal(result.gaps.length, 0, `unexpected gaps: ${JSON.stringify(result.gaps)}`);
});

test('[2.12] every fact is config-derived and cites the file', async () => {
  const result = await composeAdapter.scan({ repoRoot: withCompose(FULL), revision: 'abc' });
  for (const fact of result.facts) {
    // A manifest is configuration. Calling it statically-derived would claim
    // the scanner read code and reached this conclusion, which it did not.
    assert.equal(fact.provenance, 'config-derived', `${fact.predicate} claims the wrong provenance`);
    assert.equal(fact.location.path, 'docker-compose.yml');
  }
  assert.deepEqual(result.inventory, ['docker-compose.yml']);
});

test('[2.12] a shared network is not recorded as communication', async () => {
  // The judgement this adapter refuses to make. `web` and `db` are both on the
  // default network; that is permission to connect, not evidence that they do.
  const result = await composeAdapter.scan({ repoRoot: withCompose(FULL), revision: 'abc' });
  const invented = result.facts.filter((f) => f.subject === 'web' && f.object === 'db');
  assert.deepEqual(invented, [], 'a network share was turned into a relationship');
  assert.ok(!result.facts.some((f) => f.predicate === 'shares-network'),
    'network membership was reported as if it were a dependency');
});

test('[2.12] a construct the parser does not understand is a Gap, not an omission', async () => {
  // YAML anchors and merge keys change what a document means. Reading past
  // them silently would produce a confidently wrong topology.
  const anchored = `services:
  base: &base
    image: shared:1
  web:
    <<: *base
    ports:
      - "80:80"
`;
  const result = await composeAdapter.scan({ repoRoot: withCompose(anchored), revision: 'abc' });
  assert.ok(result.gaps.length > 0, 'an anchor was read past without a word');
  assert.match(result.gaps[0].reason, /anchor or merge key at line \d+/);
  assert.equal(result.gaps[0].path, 'docker-compose.yml');
  // And what it COULD read is still reported: one bad construct must not
  // discard the rest of the file.
  assert.ok(result.facts.some((f) => f.object === '80:80'), 'the readable part was discarded too');
});

test('[2.12] a compose file with no readable services says so', async () => {
  const result = await composeAdapter.scan({ repoRoot: withCompose('version: "3"\n'), revision: 'abc' });
  assert.equal(result.facts.length, 0);
  assert.ok(result.gaps.some((gap) => /no services could be read/.test(gap.reason)),
    'an empty compose file produced silence rather than a gap');
});

test('[2.12] all four compose filenames are recognised', async () => {
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const result = await composeAdapter.scan({ repoRoot: withCompose(FULL, name), revision: 'abc' });
    assert.ok(result.facts.length > 0, `${name} was not read`);
    assert.deepEqual(result.inventory, [name]);
  }
});

test('[2.12] a repository with no compose file produces nothing, and no gap', async () => {
  // Absence of a compose file is not a gap. A gap means "there was something
  // here I could not read"; reporting one for every repository without Docker
  // would drown the real gaps.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-compose-none-'));
  const result = await composeAdapter.scan({ repoRoot: empty, revision: 'abc' });
  assert.deepEqual(result, { facts: [], gaps: [], inventory: [] });
});

test('[2.12] the parser attaches a list to the key that opened it', () => {
  // The bug this was written against: attaching a block sequence to the inner
  // frame instead of its key leaves `ports` an empty object -- present,
  // plausible and silently wrong.
  const { tree, gaps } = parseComposeSubset(FULL, 'docker-compose.yml');
  assert.deepEqual(gaps, []);
  assert.deepEqual(tree.services.web.ports, ['80:80', '443:443']);
  assert.deepEqual(tree.services.web.depends_on, ['api']);
  assert.equal(tree.services.api.build.context, './api');
  assert.equal(tree.services.db.image, 'postgres:16');
});

test('[2.12] comments and quotes are handled without eating real values', () => {
  const commented = `services:
  web:
    image: nginx:1.25  # pinned deliberately
    command: "echo # not a comment"
`;
  const { tree } = parseComposeSubset(commented, 'c.yml');
  assert.equal(tree.services.web.image, 'nginx:1.25');
  // A '#' inside quotes is data. Stripping it would silently truncate a
  // command, and the fact would look fine.
  assert.equal(tree.services.web.command, 'echo # not a comment');
});
