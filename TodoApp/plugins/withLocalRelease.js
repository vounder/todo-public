const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withLocalRelease(config) {
  return withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Local APK builds require Groovy Gradle configuration.');
    let source = result.modResults.contents;
    if (source.includes('// @todo-local-release')) return result;
    source = source.replace(
      'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
      "def projectRoot = (findProperty('todoSourceRoot') ?: rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()).toString()"
    );
    source = source.replace('react {', 'react {\n    root = file(projectRoot)');
    source = source.replace(/versionCode (\d+)/, "versionCode Integer.parseInt((findProperty('todoVersionCode') ?: '$1').toString())");
    source = source.replace(/versionName "([^"]+)"/, "versionName (findProperty('todoVersionName') ?: '$1').toString()");
    source += [
      '',
      '// @todo-local-release',
      '// Credentials stay outside the repository and are provided by Build-ReleaseApk.ps1.',
      "def todoStore = System.getenv('TODO_APK_KEYSTORE')",
      'if (todoStore) {',
      '    android.signingConfigs.create("localRelease") {',
      '        storeFile file(todoStore)',
      "        storePassword System.getenv('TODO_APK_STORE_PASSWORD')",
      "        keyAlias System.getenv('TODO_APK_KEY_ALIAS')",
      "        keyPassword System.getenv('TODO_APK_KEY_PASSWORD')",
      '    }',
      '    android.buildTypes.release.signingConfig = android.signingConfigs.localRelease',
      '}',
      '',
    ].join('\n');
    result.modResults.contents = source;
    return result;
  });
};
