module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inlines drizzle-kit's generated .sql migration files as string constants
    // at build time, instead of letting Metro try to parse SQL as JS.
    // https://orm.drizzle.team/quick-sqlite/expo
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
