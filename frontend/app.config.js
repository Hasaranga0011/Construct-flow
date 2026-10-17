module.exports = ({ config }) => {
  const isArm64Only = process.env.ANDROID_ARM64_ONLY === 'true';

  const androidBuildProps = {
    enableProguardInReleaseBuilds: true,
    enableShrinkResourcesInReleaseBuilds: true,
    enablePngCrunchInReleaseBuilds: true,
    extraProguardRules: `
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}
-keep class com.facebook.react.** { *; }
-keep class expo.modules.** { *; }
-dontwarn com.facebook.react.**
`,
  };

  if (isArm64Only) {
    androidBuildProps.buildArchs = ['arm64-v8a'];
  }

  const basePlugins = (config.plugins || []).filter(
    (plugin) => (typeof plugin === 'string' ? plugin : plugin[0]) !== 'expo-build-properties'
  );

  return {
    ...config,
    plugins: [
      ...basePlugins,
      ['expo-build-properties', { android: androidBuildProps }],
    ],
  };
};
