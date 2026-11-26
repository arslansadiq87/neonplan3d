#!/usr/bin/env python3
"""Build and verify a HACS integration ZIP with POSIX paths and stable metadata."""

from __future__ import annotations

import argparse
import hashlib
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


def integration_files(source: Path) -> dict[str, Path]:
    root = source.resolve(strict=True)
    files: dict[str, Path] = {}
    for path in root.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        name = path.relative_to(root).as_posix()
        pure = PurePosixPath(name)
        if "\\" in name or pure.is_absolute() or ".." in pure.parts:
            raise ValueError(f"Unsafe or non-POSIX integration path: {name!r}")
        files[name] = path
    if "manifest.json" not in files:
        raise ValueError("Integration source must contain manifest.json at its root")
    return dict(sorted(files.items()))


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    return info


def build(source: Path, destination: Path) -> None:
    files = integration_files(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in files.items():
            archive.writestr(zip_info(name), path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    verify(source, destination, require_unix_metadata=True)
    print(f"Built and verified {destination}: {len(files)} files, POSIX paths")


def verify(source: Path, archive_path: Path, *, require_unix_metadata: bool = False) -> None:
    expected = integration_files(source)
    with zipfile.ZipFile(archive_path, "r") as archive:
        names = [item.filename for item in archive.infolist()]
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate entries")
        malformed = [name for name in names if "\\" in name]
        if malformed:
            raise ValueError(f"Archive contains non-POSIX entry names: {malformed[:5]}")
        if set(names) != set(expected):
            missing = sorted(set(expected) - set(names))
            extra = sorted(set(names) - set(expected))
            raise ValueError(f"Archive inventory mismatch; missing={missing[:5]}, extra={extra[:5]}")
        if archive.testzip() is not None:
            raise ValueError("Archive CRC verification failed")
        if require_unix_metadata and any(item.create_system != 3 for item in archive.infolist()):
            raise ValueError("Archive entries must use Unix creator metadata")
        if require_unix_metadata and any(item.external_attr >> 16 & 0o170000 != stat.S_IFREG for item in archive.infolist()):
            raise ValueError("Archive entries must be regular files")
        with tempfile.TemporaryDirectory(prefix="neonplan-hacs-zip-") as temp:
            archive.extractall(temp)
            extracted = Path(temp)
            for name, source_path in expected.items():
                target = extracted.joinpath(*PurePosixPath(name).parts)
                if not target.is_file():
                    raise ValueError(f"Linux-style extraction did not create expected file: {name}")
                source_hash = hashlib.sha256(source_path.read_bytes()).digest()
                extracted_hash = hashlib.sha256(target.read_bytes()).digest()
                if source_hash != extracted_hash:
                    raise ValueError(f"Extracted file hash mismatch: {name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Integration directory")
    parser.add_argument("archive", type=Path, help="ZIP output or ZIP to verify")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.verify_only:
        verify(args.source, args.archive)
        print(f"Verified {args.archive}: POSIX paths, extracted inventory and hashes match")
    else:
        build(args.source, args.archive)


if __name__ == "__main__":
    main()
