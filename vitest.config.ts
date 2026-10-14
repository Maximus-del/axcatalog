import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // NODE BY DEFAULT, NOT JSDOM.
    //
    // Every test in this repo is pure logic — 33 files, none of which renders a
    // component or touches the DOM. Standing up a jsdom document for each one
    // cost ~35s per file in setup alone and turned a full run into ~20 minutes,
    // which is long enough that the suite stops being run.
    //
    // A test that DOES need a document opts in per file, which is the idiomatic
    // vitest way and needs no config change:
    //
    //     // @vitest-environment jsdom
    //
    // The setup file below is written to no-op when there is no window, so it
    // stays correct under both environments.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // scripts/ holds the Drive photography sync. Its matching rules decide
    // which garment a photograph is attached to, so they are tested like any
    // other logic rather than trusted because they are "just a script".
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.mjs"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
