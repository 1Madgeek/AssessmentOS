import { describe, expect, it, vi, afterEach } from "vitest";
import { createZipBase64 } from "./zip.js";
import {
  extractJsonObject,
  extractXmlDocument,
  prepareUnitWorkspace,
} from "./unit-workspace.js";
import { Judge0Client, JUDGE0_MULTIFILE_LANGUAGE_ID } from "./index.js";

describe("createZipBase64", () => {
  it("produces a base64 ZIP containing listed files", async () => {
    const b64 = createZipBase64([
      { path: "run", content: "#!/bin/bash\necho hi\n" },
      { path: "solution.py", content: "def add(a,b): return a+b\n" },
    ]);
    expect(b64.length).toBeGreaterThan(20);
    const buf = Buffer.from(b64, "base64");
    // Local file header signature
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    expect(buf.toString("utf8")).toContain("solution.py");
    expect(buf.toString("utf8")).toContain("def add");
  });
});

describe("prepareUnitWorkspace", () => {
  it("builds pytest files and run script", () => {
    const prepared = prepareUnitWorkspace({
      language: "python",
      framework: "pytest",
      entrySource: "def add(a,b): return a+b\n",
      testCode: "from solution import add\ndef test_add(): assert add(1,1)==2\n",
    });
    expect("error" in prepared).toBe(false);
    if ("error" in prepared) return;
    expect(prepared.framework).toBe("pytest");
    expect(prepared.files.some((f) => f.path === "solution.py")).toBe(true);
    expect(prepared.files.some((f) => f.path === "test_solution.py")).toBe(true);
    expect(prepared.runScript).toMatch(/pytest/);
  });

  it("builds junit workspace for java", () => {
    const prepared = prepareUnitWorkspace({
      language: "java",
      framework: "junit",
      entrySource: "public class Solution { public static int add(int a,int b){return a+b;} }\n",
      testCode: "class SolutionTest {}",
    });
    expect("error" in prepared).toBe(false);
    if ("error" in prepared) return;
    expect(prepared.compileScript).toMatch(/javac/);
    expect(prepared.files.some((f) => f.path === "SolutionTest.java")).toBe(true);
  });
});

describe("extractJsonObject / extractXmlDocument", () => {
  it("pulls JSON from noisy stdout", () => {
    const raw = extractJsonObject("npm warn\n{\"ok\":true,\"n\":1}\ndone\n");
    expect(raw).toBe('{"ok":true,"n":1}');
  });

  it("pulls XML from noisy stdout", () => {
    const raw = extractXmlDocument("log\n<testsuites></testsuites>\n");
    expect(raw).toBe("<testsuites></testsuites>\n");
  });
});

describe("Judge0Client.runUnitTests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits multi-file language 89 and parses pytest stdout", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/submissions?") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          language_id: number;
          additional_files: string;
        };
        expect(body.language_id).toBe(JUDGE0_MULTIFILE_LANGUAGE_ID);
        expect(body.additional_files.length).toBeGreaterThan(10);
        return new Response(JSON.stringify({ token: "tok-1" }), { status: 201 });
      }
      if (url.includes("/submissions/tok-1")) {
        return new Response(
          JSON.stringify({
            stdout: "test_solution.py::test_add PASSED\n",
            stderr: null,
            compile_output: null,
            time: "0.01",
            memory: 1000,
            status: { id: 3, description: "Accepted" },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new Judge0Client({ baseUrl: "http://judge0.test" });
    const results = await client.runUnitTests({
      language: "python",
      framework: "pytest",
      entrySource: "def add(a,b): return a+b\n",
      testCode: "from solution import add\ndef test_add(): assert add(2,3)==5\n",
    });
    expect(results).toEqual([
      expect.objectContaining({ id: "test_add", passed: true, status: "Accepted" }),
    ]);
    expect(fetchMock).toHaveBeenCalled();
  });
});
