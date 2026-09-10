import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("package_source", ROOT / "scripts/release/package-source.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

class PackageTests(unittest.TestCase):
    def test_report_only_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "reports").mkdir()
            (path / "reports/validation.md").write_text("Everything passed")
            with self.assertRaisesRegex(ValueError, "reports are not source"):
                package.require_source(path)

    def test_archive_paths_reject_escape_and_control_characters(self):
        for name in ["../x", "项目目录/../x", "/absolute", "C:/outside", "a\\b", "a\x00b", "a/./b"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                package.safe_relative(name)
        self.assertEqual(str(package.safe_relative("项目目录/app/app.vue")), "项目目录/app/app.vue")

    def test_symlink_and_environment_files_are_not_silently_packed(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "regular").write_text("source")
            (path / "link").symlink_to(path / "regular")
            with self.assertRaisesRegex(ValueError, "Non-regular"):
                package.enumerate_source(path)
            (path / "link").unlink()
            (path / ".env").write_text("SECRET=not-a-real-secret")
            with self.assertRaisesRegex(ValueError, "environment"):
                package.enumerate_source(path)

    def test_dependencies_are_excluded_but_regular_source_is_kept(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "app").mkdir(); (path / "app/app.vue").write_text("<template>Hello</template>")
            (path / "node_modules").mkdir(); (path / "node_modules/vendor.js").write_text("unused")
            files = package.enumerate_source(path)
            self.assertEqual([p.relative_to(path).as_posix() for p in files], ["app/app.vue"])

    def test_runtime_media_is_excluded_without_dropping_media_source_modules(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "media/uploads").mkdir(parents=True)
            (path / "media/uploads/private.png").write_bytes(b"runtime")
            (path / "server/media").mkdir(parents=True)
            (path / "server/media/store.ts").write_text("export interface Store {}")
            (path / "app/pages/admin/media").mkdir(parents=True)
            (path / "app/pages/admin/media/index.vue").write_text("<template>Media</template>")
            files = package.enumerate_source(path)
            self.assertEqual([p.relative_to(path).as_posix() for p in files], [
                "app/pages/admin/media/index.vue", "server/media/store.ts",
            ])

    def test_only_docs_01_through_04_are_protected_baselines(self):
        protected = package.verify_protected(ROOT)
        self.assertEqual(set(protected), {
            "01_site_overview.md", "02_database_schema.md",
            "03_frontend_requirements.md", "04_admin_requirements.md",
        })

if __name__ == "__main__":
    unittest.main(verbosity=2)
