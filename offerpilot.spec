# PyInstaller onedir build for the local OfferPilot application.
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

datas = [("public", "public")]
datas += collect_data_files("fitz")
binaries = collect_dynamic_libs("fitz")
hiddenimports = ["agent", "uvicorn.logging", "uvicorn.loops.auto", "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets.auto"]
hiddenimports += collect_submodules("fitz")

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
