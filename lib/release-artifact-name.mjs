export function releaseArtifactPrefix(version) {
  if (typeof version !== 'string' || version !== version.trim() || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error('Invalid release version');
  }
  const [major, minor, patch] = version.split('.').map(Number);
  const lar = major > 0 || minor > 3 || (minor === 3 && patch >= 48);
  return `${lar ? 'LAR-Launcher' : 'Arma-Reforger-Launcher'}-${version}`;
}
