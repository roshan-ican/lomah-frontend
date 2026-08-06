// ESLint flat config (ESLint 9).
//
// Goal: a *usable* safety net for offline debugging — catch the mistakes that
// actually bite (unused vars, missing hook deps, unreachable code) without
// drowning the existing codebase in red. Style/formatting is owned by Prettier,
// so all stylistic rules are turned off here (see eslint-config-prettier).
//
// Run:  npm run lint:es        (report)
//       npm run lint:es -- --fix   (autofix what it can)

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Never lint build output or dependencies.
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "releases/**",
      "node_modules/**",
      "vite.config.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,tsx}", "electron-app/**/*.ts"],
    plugins: {
      "react-hooks": reactHooks,
      react: reactPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        WebSocket: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        CustomEvent: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        SVGSVGElement: "readonly",
        NodeJS: "readonly",
      },
    },
    rules: {
      // --- The rules that actually catch bugs ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { checkLoops: false }],

      // --- Pragmatic downgrades so the existing code isn't a wall of red ---
      // Unused vars are worth surfacing, but as warnings; allow _-prefixed
      // args/vars to be intentionally ignored (matches existing `_unit` style).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The codebase uses `any` in a few catch/error spots; warn, don't block.
      "@typescript-eslint/no-explicit-any": "warn",
      // These are stylistic / low-signal for this project.
      "@typescript-eslint/no-non-null-assertion": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      // Pre-existing patterns worth flagging but not blocking: a redundant
      // triple-slash react reference and a global JSX namespace augmentation
      // (a legitimate exception to no-namespace). Warn so they show up as
      // future cleanups without failing the lint gate.
      "@typescript-eslint/triple-slash-reference": "warn",
      "@typescript-eslint/no-namespace": "warn",
    },
    settings: {
      react: { version: "detect" },
    },
  },

  // Turn OFF every rule that conflicts with Prettier. Keep this last.
  prettier,
);
