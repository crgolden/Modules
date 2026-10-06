export const FAILING_SEVERITIES = ['high', 'critical'] as const;
export const REPORTED_SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export const EXCEPTIONS_FILE = 'npm-audit-exceptions.json';
export const ADVISORY_URL_SEPARATOR = '/';

export type Severity = (typeof REPORTED_SEVERITIES)[number];

export interface AuditAdvisory {
  readonly url: string;
  readonly severity: Severity;
  readonly title: string;
}

export interface AuditEntry {
  readonly isDirect: boolean;
  readonly via: readonly (string | AuditAdvisory)[];
  readonly effects: readonly string[];
}

export interface AuditReport {
  readonly auditReportVersion?: number;
  readonly vulnerabilities?: Readonly<Record<string, AuditEntry>>;
  readonly error?: unknown;
}

export interface AuditException {
  readonly advisory: string;
  readonly through: readonly string[];
  readonly expires: string;
  readonly reason: string;
}

export interface AuditFinding {
  readonly advisory: string;
  readonly severity: Severity;
  readonly title: string;
  readonly vulnerablePackage: string;
  readonly through: readonly string[];
}

export interface AuditVerdict {
  readonly passed: boolean;
  readonly report: readonly string[];
}

export function advisoryIdOf(url: string): string {
  return url.slice(url.lastIndexOf(ADVISORY_URL_SEPARATOR) + 1);
}

export function noVerdictLine(): string {
  return 'NO VERDICT: npm audit returned no vulnerabilities report (registry unreachable, auth refused or an npm error); this is never a pass';
}

export function failingLine(finding: AuditFinding): string {
  return `FAIL ${finding.severity} ${finding.advisory} in ${finding.vulnerablePackage} through ${finding.through.join(', ')}: ${finding.title}`;
}

export function reportedLine(finding: AuditFinding): string {
  return `report ${finding.severity} ${finding.advisory} in ${finding.vulnerablePackage} through ${finding.through.join(', ')}: ${finding.title}`;
}

export function exceptedLine(finding: AuditFinding, exception: AuditException): string {
  return `excepted ${finding.severity} ${finding.advisory} through ${finding.through.join(', ')} until ${exception.expires}: ${exception.reason}`;
}

export function expiredLine(exception: AuditException): string {
  return `FAIL the exception for ${exception.advisory} through ${exception.through.join(', ')} expired on ${exception.expires}`;
}

export function staleLine(exception: AuditException): string {
  return `FAIL the exception for ${exception.advisory} through ${exception.through.join(', ')} matches no finding; remove it`;
}

function directDependenciesReaching(name: string, vulnerabilities: Readonly<Record<string, AuditEntry>>): string[] {
  const roots = new Set<string>();
  const seen = new Set<string>();
  const pending = [name];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const entry = vulnerabilities[current];
    if (entry === undefined) {
      continue;
    }
    if (entry.isDirect) {
      roots.add(current);
    }
    pending.push(...entry.effects);
  }
  return [...roots].sort(compareOrdinal);
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

export function findingsOf(vulnerabilities: Readonly<Record<string, AuditEntry>>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    for (const via of entry.via) {
      if (typeof via === 'string') {
        continue;
      }
      findings.push({
        advisory: advisoryIdOf(via.url),
        severity: via.severity,
        title: via.title,
        vulnerablePackage: name,
        through: directDependenciesReaching(name, vulnerabilities),
      });
    }
  }
  return findings;
}

function isExpired(exception: AuditException, today: Date): boolean {
  return new Date(exception.expires).getTime() < today.getTime();
}

function covers(exception: AuditException, finding: AuditFinding): boolean {
  return exception.advisory === finding.advisory && finding.through.length > 0 && finding.through.every((root) => exception.through.includes(root));
}

export function evaluateAudit(auditReport: AuditReport, exceptions: readonly AuditException[], today: Date): AuditVerdict {
  if (auditReport.vulnerabilities === undefined || auditReport.error !== undefined) {
    return { passed: false, report: [noVerdictLine()] };
  }
  const findings = findingsOf(auditReport.vulnerabilities);
  const live = exceptions.filter((exception) => !isExpired(exception, today));
  const report: string[] = [];
  let passed = true;
  for (const finding of findings) {
    const exception = live.find((candidate) => covers(candidate, finding));
    if (exception !== undefined) {
      report.push(exceptedLine(finding, exception));
    } else if ((FAILING_SEVERITIES as readonly Severity[]).includes(finding.severity)) {
      report.push(failingLine(finding));
      passed = false;
    } else {
      report.push(reportedLine(finding));
    }
  }
  for (const exception of exceptions) {
    if (isExpired(exception, today)) {
      report.push(expiredLine(exception));
      passed = false;
    } else if (!findings.some((finding) => covers(exception, finding))) {
      report.push(staleLine(exception));
      passed = false;
    }
  }
  return { passed, report };
}
