# Security Policy

## Reporting a vulnerability

Use **[private vulnerability reporting](https://github.com/Hasan-Laraib/Mirofy/security/advisories/new)**
on this repository. It is enabled, and it is the only channel — please do not
open a public issue for a security problem.

Include what you did, what happened, and what you expected. Please do **not**
include working exploits, credentials, or anyone's private data; a description
of the class of problem is enough to act on, and the rest only widens the blast
radius while the fix is being written.

Expect an acknowledgement within 5 working days.

## What is in scope

The CLI, the renderers, the validators, the scan pipeline, and the artifacts
they produce.

**A rendered artifact is the interesting surface**, because it is a single HTML
file that people open from disk and send to each other. Anything that lets a
diagram document put executable script into that file, or reach the network
from it, is a real finding. So is anything that makes the CLI read or write
outside the paths it was given.

## What is out of scope

- Vulnerabilities in whatever a diagram *describes*. Drawing an insecure system
  is not the same as being one.
- Anything requiring a machine that is already compromised. If an attacker can
  edit the JSON you render, they did not need this tool.
- Exhausting your own machine by handing the tool an enormous document. It is a
  local command-line program; the resource limit is your patience.

## What this project does not do

Worth stating plainly, because these remove whole categories of risk rather
than mitigating them:

- **No runtime dependencies.** Every package declares zero, so there is no
  transitive supply chain to audit.
- **No network access at runtime.** Nothing is downloaded, nothing is uploaded,
  and there is no update check — a tool that reaches the network to tell you
  about itself is a tool that reaches the network.
- **No telemetry.** Nothing is collected, so nothing can leak.
- **The published artifact is one file.** It opens from disk with no server and
  no external requests.

## Supported versions

The latest release. This project is at `0.1.0` and moves quickly; fixes go to
`main` and into the next version rather than back to older ones.
