@{
    Schema   = 1
    Repo     = 'Modules'
    Workflow = '.github/workflows/publish.yml'
    Sonar    = @{ ProjectKey = 'crgolden_Modules' }
    Probe    = @{
        Kind     = 'node'
        Roots    = @{ 'src/' = 'node' }
        Compiled = @{ 'src/' = 'dist-test/' }
        Before   = @{ 'src/' = @('npx', 'tsc', '-p', 'tsconfig.unit.json') }
    }
    Steps    = @(
        @{ Name = 'Install dependencies'; NodeInstall = @('tsc'); Inputs = @('package.json', 'package-lock.json'); Always = $true }
        @{ Name = 'Lint'; Tier = 'Fast'; Run =@('npm', 'run', 'lint'); Needs = @('Install dependencies'); Inputs = @('*') }
        @{ Name = 'Build'; Run = @('npm', 'run', 'build'); Needs = @('Install dependencies'); Inputs = @('*') }
        @{
            Name     = 'Audit dependencies (fails on high or critical)'
            Run      = @('npm', 'run', 'audit')
            Needs    = @('Build')
            Inputs   = @('package.json', 'package-lock.json', 'src/npm-audit/*')
            Volatile = $true
        }
        @{ Name = 'Test'; Run = @('npm', 'test'); Needs = @('Build'); Inputs = @('*', '!integration/*') }
        @{ Name = 'Integration tests'; Run = @('npm', 'run', 'test:integration'); Needs = @('Build'); Inputs = @('*') }
        @{
            Name   = 'SonarCloud analysis'
            Sonar  = 'scan'
            Run    = @(
                'sonar-scanner'
                '-Dsonar.projectKey={sonarProject}'
                '-Dsonar.organization=crgolden'
                '-Dsonar.host.url=https://sonarcloud.io'
                '-Dsonar.exclusions=**/node_modules/**,**/*.d.ts,dist/**,dist-test/**,dist-integration/**'
                '-Dsonar.test.inclusions=**/*.test.ts'
                '-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info'
                '-Dsonar.scanner.skipJreProvisioning=true'
                '-Dsonar.scm.use.blame.algorithm=GIT_NATIVE_BLAME'
                '-Dsonar.qualitygate.wait=true'
                '-Dsonar.branch.name={sonarBranch}'
            )
            Needs  = @('Build')
            Inputs = @('*')
        }
        @{ Name = 'Fail on open Sonar issues'; Sonar = 'issues'; Needs = @('SonarCloud analysis'); Inputs = @('*') }
        @{ Name = 'Publish when the version is new'; Delivery = $true }
    )
}
