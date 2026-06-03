import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import security from "eslint-plugin-security";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: false },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      security,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-object-injection": "off",
    },
  },
];
