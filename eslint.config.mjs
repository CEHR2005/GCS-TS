import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "fixtures/**",
      ".superpowers/**",
      ".worktrees/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
