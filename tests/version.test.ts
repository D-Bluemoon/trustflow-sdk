import * as fs from 'fs';
import * as path from 'path';
import { SDK_VERSION, TrustFlowClient } from '../src';
import { SDK_VERSION as CONSTANTS_SDK_VERSION } from '../src/constants';

describe('SDK_VERSION invariant tests', () => {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const changelogContent = fs.readFileSync(changelogPath, 'utf8');

  // Find latest released semver version from CHANGELOG.md (first ## [X.Y.Z] entry, ignoring [Unreleased])
  const changelogVersionMatch = changelogContent.match(/##\s*\[(\d+\.\d+\.\d+)\]/);
  const latestChangelogVersion = changelogVersionMatch ? changelogVersionMatch[1] : null;

  it('exports SDK_VERSION from src/index matching src/constants', () => {
    expect(SDK_VERSION).toBeDefined();
    expect(SDK_VERSION).toBe(CONSTANTS_SDK_VERSION);
  });

  it('matches TrustFlowClient version property and auth headers', () => {
    const client = new TrustFlowClient({
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });

    expect(client.version).toBe(SDK_VERSION);
    expect(client.getConfig().version).toBe(SDK_VERSION);
    expect(client.getAuthHeaders()['X-SDK-Version']).toBe(SDK_VERSION);
  });

  it('matches package.json version field', () => {
    expect(packageJson.version).toBe(SDK_VERSION);
  });

  it('matches CHANGELOG.md latest released entry', () => {
    expect(latestChangelogVersion).not.toBeNull();
    expect(latestChangelogVersion).toBe(SDK_VERSION);
    expect(packageJson.version).toBe(latestChangelogVersion);
  });
});
