"""Reuse the canonical resource factory without executing its legacy app bootstrap.

Generate a deployment-only module in the temporary Worker package. The repository's
backend remains byte-for-byte unchanged; unexpected bootstrap changes fail closed.
"""
import ast


def source(root):
    path = root / 'backend/entrypoints/worker.py'
    text = path.read_text(encoding='utf-8')
    tree = ast.parse(text, filename=str(path))
    expected = ast.parse('app=create_app(resource_factory)\nDefault=asgi.entrypoint(app)').body
    if len(tree.body) < 2 or any(ast.dump(a) != ast.dump(b) for a, b in zip(tree.body[-2:], expected)):
        raise ValueError('Worker bootstrap changed; review resource extraction / Worker 入口已变化，请检查资源提取规则')
    factories = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'resource_factory']
    if len(factories) != 1:
        raise ValueError('Expected exactly one canonical resource_factory')
    # Preserve original text (including the function body); omit only app exports.
    lines = text.splitlines(keepends=True)
    return ''.join(lines[:tree.body[-2].lineno - 1])


def generate(root, stage):
    target = stage / 'src/worker_runtime/resources.py'
    text = source(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def verify(root, stage):
    target = stage / 'src/worker_runtime/resources.py'
    if not target.is_file() or target.read_text(encoding='utf-8') != source(root):
        raise ValueError('Generated Worker resources differ from canonical factory')
