const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Lets Metro import the .sql files that drizzle-kit generates as migrations
// (see drizzle/migrations.js) — https://orm.drizzle.team/quick-sqlite/expo
config.resolver.sourceExts.push("sql");

module.exports = config;
