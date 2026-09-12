"""Normalize only explicitly selected publish artifacts, never follow links."""
import os
import stat
import warnings
from pathlib import Path


def checked_path(root, path):
    root = Path(os.path.abspath(root))
    if ".." in Path(path).parts:
        raise ValueError(f"Parent traversal forbidden in publish path: {path}")
    path = Path(os.path.abspath(path))
    if not path.is_relative_to(root):
        raise ValueError(f'Artifact escapes publishRoot: {path}')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ValueError(f'Symlink forbidden in publish path: {part}')
    if path.exists() and path.is_file() and path.stat().st_nlink != 1:
        raise ValueError(f'Hard-linked publish artifact forbidden: {path}')
    return path


def normalize_artifacts(root, files):
    root = Path(os.path.abspath(root))
    paths = [checked_path(root, p) for p in files]
    directories = {checked_path(root, root)}
    for path in paths:
        if not path.is_file():
            raise RuntimeError(f'Missing published artifact: {path}')
        directories.update(p for p in path.parents if p == root or p.is_relative_to(root))
    try:
        for directory in sorted(directories, key=lambda p: len(p.parts)):
            os.chmod(directory, 0o755)
        for path in paths:
            os.chmod(path, 0o644)
        for path in directories | set(paths):
            expected = 0o755 if path.is_dir() else 0o644
            if stat.S_IMODE(path.stat().st_mode) != expected:
                raise RuntimeError(f'Incorrect Web permissions: {path}; expected {expected:o}')
    except OSError as error:
        raise RuntimeError(f'Cannot set Web permissions within publishRoot {root}: {error}') from error
    # Ancestors are checked but NEVER modified (they may belong to other owners).
    for parent in root.parents:
        if not parent.stat().st_mode & stat.S_IXOTH:
            warnings.warn(f'Publish permissions normalized; ancestor lacks other-execute: {parent}. Verify www-data group/ACL access; ancestor was not modified.', RuntimeWarning)
