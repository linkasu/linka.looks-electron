/** @type {import("prettier").Config} */
const config = {
  // Matches the style the repository already follows and that ESLint used to
  // enforce through `quotes`, `semi`, `comma-dangle` and `indent`.
  singleQuote: false,
  semi: true,
  trailingComma: "none",
  tabWidth: 2,
  // 99% of existing lines are under 100 characters, so this keeps reflow noise
  // down compared to the 80 default.
  printWidth: 100
};

module.exports = config;
