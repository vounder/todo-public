const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withNetworkSecurityConfig(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Füge networkSecurityConfig zum application tag hinzu
    if (!manifest.application) {
      manifest.application = [{}];
    }

    manifest.application[0].$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return config;
  });
}

function withNetworkSecurityConfigFile(config) {
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      [
        function writeNetworkSecurityConfig(config) {
          return require('@expo/config-plugins').withDangerousMod(config, [
            'android',
            async (config) => {
              const projectRoot = config.modRequest.projectRoot;
              const xmlDir = path.join(
                projectRoot,
                'android',
                'app',
                'src',
                'main',
                'res',
                'xml'
              );

              // Erstelle xml Verzeichnis falls es nicht existiert
              if (!fs.existsSync(xmlDir)) {
                fs.mkdirSync(xmlDir, { recursive: true });
              }

              // Schreibe network_security_config.xml
              const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>`;

              fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), xmlContent);

              return config;
            },
          ]);
        },
      ],
    ],
  };
}

module.exports = function(config) {
  config = withNetworkSecurityConfig(config);
  config = withNetworkSecurityConfigFile(config);
  return config;
};
