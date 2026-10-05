const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// jspdf's "node" export (jspdf.node.min.js) uses an AMD-style `require([...], cb)` call
// that Metro's parser rejects during the expo-router static render (Node) pass.
// Always resolve jspdf to its ES build, which works for both web and server bundling.
const jspdfEsBuild = path.join(__dirname, "node_modules", "jspdf", "dist", "jspdf.es.min.js");
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jspdf") {
    return { type: "sourceFile", filePath: jspdfEsBuild };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
