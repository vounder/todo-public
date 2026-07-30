const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    if (!manifest.application) {
      manifest.application = [{}];
    }

    manifest.application[0].$['android:networkSecurityConfig'] =
      '@xml/network_security_config';
    return androidConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const xmlDirectory = path.join(
        androidConfig.modRequest.projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

      fs.mkdirSync(xmlDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDirectory, 'network_security_config.xml'),
        xml,
        'utf8'
      );
      return androidConfig;
    },
  ]);
};
