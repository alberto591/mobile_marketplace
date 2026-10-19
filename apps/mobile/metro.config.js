const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// Monorepo root directory resolution
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve packages in both local and workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Prevent duplicate react/react-native package resolution
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
