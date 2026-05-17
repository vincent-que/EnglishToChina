import importlib.metadata as metadata
import re
import shutil
import sys
from pathlib import Path


REQUESTED = [
    "PyMuPDF",
    "pdfplumber",
    "python-docx",
    "reportlab",
    "pdf2docx",
    "docx2pdf",
    "opencv-python",
]


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_name(requirement: str) -> str:
    return re.split(r"[ <>=!~;\[]", requirement, maxsplit=1)[0].strip()


def main() -> None:
    target = Path(sys.argv[1])
    available = {
        normalize(dist.metadata["Name"]): dist
        for dist in metadata.distributions()
        if dist.metadata.get("Name")
    }

    queue = [normalize(name) for name in REQUESTED]
    seen: set[str] = set()
    missing: set[str] = set()

    while queue:
        name = queue.pop(0)
        if name in seen:
            continue
        dist = available.get(name)
        if not dist:
            missing.add(name)
            continue
        seen.add(name)
        for requirement in dist.requires or []:
            dep = requirement_name(requirement)
            if dep:
                queue.append(normalize(dep))

    target.mkdir(parents=True, exist_ok=True)

    for name in sorted(seen):
        dist = available[name]
        location = Path(str(dist.locate_file("")))
        for file in dist.files or []:
            source = Path(dist.locate_file(file))
            if not source.exists():
                continue
            relative = source.relative_to(location)
            destination = target / relative
            if source.is_dir():
                shutil.copytree(source, destination, dirs_exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)

    print("Copied distributions:", ", ".join(sorted(seen)))
    if missing:
        print("Missing optional distributions:", ", ".join(sorted(missing)))


if __name__ == "__main__":
    main()
