# PyInstaller onedir build for the local OfferPilot application.
from PyInstaller.utils.hooks import collect_all

datas = [("public", "public")]
binaries = []
hiddenimports = []
for package in ("fitz", "uvicorn", "pymupdf"):
    try:
        d, b, h = collect_all(package)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

a = Analysis(
    ["launcher.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="OfferPilotLight", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="OfferPilotLight")
