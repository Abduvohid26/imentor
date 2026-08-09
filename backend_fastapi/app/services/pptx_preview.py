"""PPTX/PPT → PDF preview (LibreOffice, bepul)."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_SOFFICE_CANDIDATES = (
    "soffice",
    "libreoffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
)


def find_soffice() -> str | None:
    for name in _SOFFICE_CANDIDATES:
        path = shutil.which(name) if "/" not in name else (name if Path(name).exists() else None)
        if path:
            return path
    return None


def preview_pdf_path_for(source: Path) -> Path:
    """Cached PDF next to source: foo.pptx → foo.preview.pdf"""
    return source.with_name(source.stem + ".preview.pdf")


def _unoconvert_cmd() -> str | None:
    return shutil.which("unoconvert")


def _convert_via_unoserver(src: Path, out_pdf: Path) -> bool:
    """Doimiy `unoserver` demoni orqali konvert qiladi.

    Demon ishlamayotgan bo'lsa (yoki `unoconvert` yo'q bo'lsa) — False
    qaytaradi va chaqiruvchi eski `soffice --convert-to` usuliga tushadi.
    Shu sababli bu funksiya hech qachon istisno ko'tarmaydi.
    """
    unoconvert = _unoconvert_cmd()
    if not unoconvert:
        return False

    port = os.environ.get("UNOSERVER_PORT", "2003")
    tmp_target = out_pdf.with_suffix(".pdf.uno.tmp")
    try:
        proc = subprocess.run(
            [
                unoconvert,
                "--host", "127.0.0.1",
                "--port", port,
                "--convert-to", "pdf",
                str(src),
                str(tmp_target),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if proc.returncode != 0 or not tmp_target.is_file() or tmp_target.stat().st_size == 0:
            logger.warning(
                "unoserver konvert ishlamadi (rc=%s), soffice zaxira usuliga o'tilmoqda. stderr=%s",
                proc.returncode,
                (proc.stderr or "")[:300],
            )
            tmp_target.unlink(missing_ok=True)
            return False
        tmp_target.replace(out_pdf)
        logger.info("unoserver preview tayyor: %s", out_pdf.name)
        return True
    except Exception as e:
        logger.warning("unoserver mavjud emas/xato (%s), soffice zaxira usuli ishlatiladi", e)
        try:
            tmp_target.unlink(missing_ok=True)
        except Exception:
            pass
        return False


def ensure_presentation_preview_pdf(source: Path) -> Path:
    """
    PPTX/PPT ni PDF ga aylantiradi (LibreOffice headless).
    PDF allaqachon bor va yangiroq bo'lsa — qayta konvert qilmaydi.
    """
    src = Path(source).resolve()
    if not src.is_file():
        raise FileNotFoundError(f"Manba topilmadi: {src}")

    suffix = src.suffix.lower()
    if suffix == ".pdf":
        return src
    if suffix not in (".pptx", ".ppt", ".odp"):
        raise ValueError(f"Preview qo'llab-quvvatlanmaydi: {suffix}")

    out_pdf = preview_pdf_path_for(src)
    if out_pdf.is_file() and out_pdf.stat().st_mtime >= src.stat().st_mtime and out_pdf.stat().st_size > 0:
        return out_pdf

    out_pdf.parent.mkdir(parents=True, exist_ok=True)

    # 1-usul: doimiy ishlaydigan unoserver demoni (tez, xotira barqaror).
    if _convert_via_unoserver(src, out_pdf):
        return out_pdf

    # 2-usul (zaxira): har safar yangi LibreOffice jarayoni.
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError(
            "LibreOffice o'rnatilmagan (soffice). "
            "Docker: apt-get install -y libreoffice-impress-nogui fonts-dejavu-core"
        )

    with tempfile.TemporaryDirectory(prefix="imentor-pptx-") as tmp:
        tmp_dir = Path(tmp)
        env = os.environ.copy()
        env["HOME"] = str(tmp_dir)
        env["SAL_USE_VCLPLUGIN"] = "svp"
        cmd = [
            soffice,
            "--headless",
            "--nologo",
            "--nolockcheck",
            "--nodefault",
            "--nofirststartwizard",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tmp_dir),
            str(src),
        ]
        logger.info("PPTX preview convert: %s", src.name)
        proc = subprocess.run(
            cmd,
            cwd=str(tmp_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if proc.returncode != 0:
            logger.error(
                "LibreOffice convert failed rc=%s stderr=%s stdout=%s",
                proc.returncode,
                (proc.stderr or "")[:800],
                (proc.stdout or "")[:400],
            )
            raise RuntimeError("PPTX ni PDF ga aylantirib bo'lmadi (LibreOffice).")

        produced = tmp_dir / f"{src.stem}.pdf"
        if not produced.is_file():
            pdfs = list(tmp_dir.glob("*.pdf"))
            if not pdfs:
                raise RuntimeError("LibreOffice PDF yaratmadi.")
            produced = pdfs[0]

        # Atomik almashtirish
        tmp_target = out_pdf.with_suffix(".pdf.tmp")
        shutil.copy2(produced, tmp_target)
        tmp_target.replace(out_pdf)

    return out_pdf
