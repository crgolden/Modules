import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FAILING_SEVERITIES,
  REPORTED_SEVERITIES,
  evaluateAudit,
  exceptedLine,
  expiredLine,
  failingLine,
  findingsOf,
  noVerdictLine,
  reportedLine,
  staleLine,
  type AuditEntry,
  type AuditException,
  type AuditReport,
  type Severity,
} from './audit';
import { newCount, newCountCeiling, newHttpsAddress, newMemberOf, newText } from '../testing';

interface Chain {
  readonly vulnerabilities: Readonly<Record<string, AuditEntry>>;
  readonly report: AuditReport;
  readonly advisory: string;
  readonly direct: string;
  readonly vulnerable: string;
}

function failingSeverity(): Severity {
  return newMemberOf(FAILING_SEVERITIES);
}

function reportedOnlySeverity(): Severity {
  return newMemberOf(REPORTED_SEVERITIES.filter((severity) => !(FAILING_SEVERITIES as readonly Severity[]).includes(severity)));
}

function chainThroughDirectDependency(severity: Severity): Chain {
  const advisory = `GHSA-${newText()}`;
  const direct = newText();
  const middle = newText();
  const vulnerable = newText();
  const vulnerabilities: Readonly<Record<string, AuditEntry>> = {
      [vulnerable]: { isDirect: false, via: [{ url: `${newHttpsAddress()}/${advisory}`, severity, title: newText() }], effects: [middle] },
      [middle]: { isDirect: false, via: [vulnerable], effects: [direct] },
      [direct]: { isDirect: true, via: [middle], effects: [] },
  };
  return { vulnerabilities, report: { vulnerabilities }, advisory, direct, vulnerable };
}

function laterThan(instant: Date): string {
  return new Date(instant.getTime() + newCount() * newCountCeiling()).toISOString();
}

function earlierThan(instant: Date): string {
  return new Date(instant.getTime() - newCount() * newCountCeiling()).toISOString();
}

function exceptionFor(advisory: string, through: string, expires: string): AuditException {
  return { advisory, through: [through], expires, reason: newText() };
}

test('must-block: a high or critical finding with no exception fails and is named', () => {
  const chain = chainThroughDirectDependency(failingSeverity());
  const today = new Date();

  const verdict = evaluateAudit(chain.report, [], today);

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.report, [failingLine(findingsOf(chain.vulnerabilities)[0])]);
});

test('a moderate or lower finding is reported without failing', () => {
  const chain = chainThroughDirectDependency(reportedOnlySeverity());
  const today = new Date();

  const verdict = evaluateAudit(chain.report, [], today);

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.report, [reportedLine(findingsOf(chain.vulnerabilities)[0])]);
});

test('a finding is traced to the direct dependency that pulls it in', () => {
  const chain = chainThroughDirectDependency(failingSeverity());

  const findings = findingsOf(chain.vulnerabilities);

  assert.deepEqual(findings.map((finding) => finding.through), [[chain.direct]]);
  assert.deepEqual(findings.map((finding) => finding.vulnerablePackage), [chain.vulnerable]);
});

test('control: a live exception for the advisory through its direct dependency passes and says so', () => {
  const today = new Date();
  const chain = chainThroughDirectDependency(failingSeverity());
  const exception = exceptionFor(chain.advisory, chain.direct, laterThan(today));

  const verdict = evaluateAudit(chain.report, [exception], today);

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.report, [exceptedLine(findingsOf(chain.vulnerabilities)[0], exception)]);
});

test('must-block: the same advisory through a different direct dependency still fails', () => {
  const today = new Date();
  const chain = chainThroughDirectDependency(failingSeverity());
  const exception = exceptionFor(chain.advisory, newText(), laterThan(today));

  const verdict = evaluateAudit(chain.report, [exception], today);

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.report, [failingLine(findingsOf(chain.vulnerabilities)[0]), staleLine(exception)]);
});

test('must-block: an expired exception fails and no longer covers its finding', () => {
  const today = new Date();
  const chain = chainThroughDirectDependency(failingSeverity());
  const exception = exceptionFor(chain.advisory, chain.direct, earlierThan(today));

  const verdict = evaluateAudit(chain.report, [exception], today);

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.report, [failingLine(findingsOf(chain.vulnerabilities)[0]), expiredLine(exception)]);
});

test('must-block: an exception that matches no finding fails, so a fixed advisory cannot leave one behind', () => {
  const today = new Date();
  const exception = exceptionFor(`GHSA-${newText()}`, newText(), laterThan(today));

  const verdict = evaluateAudit({ vulnerabilities: {} }, [exception], today);

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.report, [staleLine(exception)]);
});

test('must-block: a report with no vulnerabilities object is no verdict, never a pass', () => {
  const today = new Date();

  const verdict = evaluateAudit({ error: newText() }, [], today);

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.report, [noVerdictLine()]);
});

test('control: a clean report with no exceptions passes and prints nothing', () => {
  const today = new Date();

  const verdict = evaluateAudit({ vulnerabilities: {} }, [], today);

  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.report, []);
});
