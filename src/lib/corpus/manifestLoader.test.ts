import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadManifest } from "./manifestLoader";

const realManifest = readFileSync(
  resolve(__dirname, "../../../knowledge-base/manifest.yaml"),
  "utf8"
);

describe("corpusManifestLoader - tracer", () => {
  it("parses the committed manifest.yaml and exposes both sources", () => {
    const manifest = loadManifest(realManifest);

    expect(manifest.version).toBe(1);
    expect(manifest.sources).toHaveLength(2);
    expect(manifest.retrieval.default_top_k).toBe(4);
    expect(manifest.retrieval.default_mode).toBe("universal");

    const ids = manifest.sources.map((s) => s.id);
    expect(ids).toContain("advances-fin-ml-de-prado-2018");
    expect(ids).toContain("151-trading-strategies-kakushadze-serur-2018");

    for (const source of manifest.sources) {
      expect(source.nia_source_id).toBe("TBD");
    }
  });
});

describe("corpusManifestLoader - schema failures", () => {
  it("rejects a manifest missing 'version'", () => {
    const yaml = `
retrieval:
  default_top_k: 4
  default_mode: universal
  citation_format: "{title}, p.{page}"
sources: []
`;
    expect(() => loadManifest(yaml)).toThrow();
  });

  it("rejects a source missing 'id'", () => {
    const yaml = `
version: 1
retrieval:
  default_top_k: 4
  default_mode: universal
  citation_format: "{title}, p.{page}"
sources:
  - title: A Book
    authors: ["Someone"]
    year: 2020
    nia_source_id: TBD
`;
    expect(() => loadManifest(yaml)).toThrow();
  });

  it("rejects invalid YAML", () => {
    const yaml = "version: 1\n  bad indentation: : :";
    expect(() => loadManifest(yaml)).toThrow();
  });

  it("accepts a manifest containing extra unknown fields (passthrough for forward compat)", () => {
    const yaml = `
version: 1
retrieval:
  default_top_k: 4
  default_mode: universal
  citation_format: "{title}, p.{page}"
  experimental_setting: hello
sources:
  - id: test-source
    title: Test
    authors: ["X"]
    year: 2024
    nia_source_id: TBD
    secret_extension: 42
unknown_top_level_key: anything
`;
    const manifest = loadManifest(yaml);
    expect(manifest.sources[0].id).toBe("test-source");
  });
});
