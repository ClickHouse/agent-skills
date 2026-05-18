import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_json(path):
    with (ROOT / path).open() as handle:
        return json.load(handle)


def load_skill_name(skill_file):
    text = skill_file.read_text()
    match = re.search(r"^name:\s*([A-Za-z0-9_.:-]+)\s*$", text, re.MULTILINE)
    if not match:
        raise AssertionError(f"Missing frontmatter name in {skill_file}")
    return match.group(1)


def codex_entries():
    marketplace = load_json(".agents/plugins/marketplace.json")
    return {plugin["name"]: plugin for plugin in marketplace["plugins"]}


def claude_entries():
    marketplace = load_json(".claude-plugin/marketplace.json")
    return {plugin["name"]: plugin for plugin in marketplace["plugins"]}


def codex_plugin_root(entry):
    source = entry.get("source")
    if not isinstance(source, dict):
        raise AssertionError(f"{entry['name']} must use a Codex source object")
    if source.get("source") != "local":
        raise AssertionError(f"{entry['name']} must use a local source in this repo")
    path = source.get("path")
    if not isinstance(path, str) or not path.startswith("./"):
        raise AssertionError(f"{entry['name']} source.path must be ./-relative")
    if path in {".", "./"}:
        raise AssertionError(f"{entry['name']} source.path must not point at repo root")
    return (ROOT / path).resolve()


def codex_manifest(entry):
    plugin_root = codex_plugin_root(entry)
    manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    if not manifest_path.is_file():
        raise AssertionError(f"Missing Codex plugin manifest: {manifest_path}")
    with manifest_path.open() as handle:
        return plugin_root, json.load(handle)


def codex_skill_names(plugin_root, manifest):
    skills_path = manifest.get("skills", "./skills/")
    if not isinstance(skills_path, str) or not skills_path.startswith("./"):
        raise AssertionError(f"{manifest['name']} skills path must be ./-relative")
    resolved = (plugin_root / skills_path).resolve()
    if not resolved.exists():
        raise AssertionError(f"Missing skills path: {resolved}")

    names = set()
    direct_skill = resolved / "SKILL.md"
    if direct_skill.is_file():
        names.add(load_skill_name(direct_skill))
    if resolved.is_dir():
        for child in sorted(resolved.iterdir()):
            skill_file = child / "SKILL.md"
            if skill_file.is_file():
                names.add(load_skill_name(skill_file))
    if not names:
        raise AssertionError(f"No Codex skills found under {resolved}")
    return names


class CodexPluginMetadataTest(unittest.TestCase):
    def test_codex_and_claude_marketplaces_expose_same_plugins(self):
        self.assertEqual(set(claude_entries()), set(codex_entries()))

    def test_codex_entries_resolve_to_plugin_manifests(self):
        for name, entry in codex_entries().items():
            with self.subTest(plugin=name):
                plugin_root, manifest = codex_manifest(entry)
                self.assertEqual(name, manifest["name"])
                self.assertEqual(
                    entry["category"],
                    manifest.get("interface", {}).get("category"),
                )
                self.assertTrue(codex_skill_names(plugin_root, manifest))

    def test_codex_manifest_metadata_matches_marketplace(self):
        for name, entry in codex_entries().items():
            with self.subTest(plugin=name):
                _, manifest = codex_manifest(entry)
                claude_entry = claude_entries()[name]
                self.assertEqual(claude_entry["version"], manifest["version"])
                self.assertEqual(claude_entry["homepage"], manifest["homepage"])
                self.assertEqual(claude_entry["repository"], manifest["repository"])
                self.assertEqual(
                    claude_entry["author"]["name"],
                    manifest["author"]["name"],
                )


if __name__ == "__main__":
    unittest.main()
