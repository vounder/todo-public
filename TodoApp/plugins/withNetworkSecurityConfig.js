const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

module.exports = function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application[0];
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return result;
  });
  return withDangerousMod(config, ['android', async result => {
    const directory = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'network_security_config.xml'), [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<network-security-config>',
      '  <base-config cleartextTrafficPermitted="true" />',
      '</network-security-config>',
      '',
    ].join('\n'));
    return result;
  }]);
};
